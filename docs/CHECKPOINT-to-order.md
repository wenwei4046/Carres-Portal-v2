# CHECKPOINT — Purchasing · To Order

> **Handover, updated 2026-08-01 (sixth session — the day Loo redesigned the
> page five times in one sitting and froze the Excel grid + the Portal Grid
> Workspace standard).** Overwritten in place; there is never a second version
> of this file.
>
> **⭐ LOO'S STANDING ORDER (2026-07-31, re-affirmed 2026-08-01: "im the
> boss"): he is the boss of this page's design. Older frozen rules are
> OVERWRITTEN by §0A below, not annotated. Every chat: discuss in ASCII FIRST,
> build only after he agrees, deploy one step at a time, and give him the
> localhost preview BEFORE asking him to merge.** Deploy state is §15.

---

## 0A · THE FROZEN RULINGS (Loo, 2026-07-31 → 2026-08-01 — these OVERWRITE the 2026-07-31 card-queue blueprint whole)

**The division of responsibility (final):**

```
To Order          DECIDES which customer orders become purchase orders today.
                  Listing · views · checkbox · batch create. NOTHING ELSE.
Purchase Orders   MANAGES the documents once they exist: preview ·
                  communication · audit · PDF · WhatsApp · revision ·
                  ready date — ALL of it, there.
```

**THE GOLDEN RULE:** *The planning engine owns the schedule. Operators own
the Purchase Order. Operators never choose the next purchasing run — they
only change the business requirement, and the engine always recalculates.*
Therefore **Hold · Skip · Next Run · Delay · Postpone · Move-to-Monday do
not exist and never may** — each is an operator doing the engine's job. The
two real exceptions are `Change Required Date` (a new required date the
engine replans from — it NEVER touches `orders.delivery_date`, the customer
promise) and `Cancel Purchase`; both need stored state and are **v4,
designed not built**.

**The page (deployed):** an Excel grid. Rows = customer orders; groups = the
FUTURE purchase orders (supplier × category; sofa one per order) drawn
before the button is pressed; batch bar tells the truth (`N of M SO selected
→ will create K Purchase Orders`, computed from the same shared projection
the server recomputes); one POST per group, per-group ✓/✗ + Retry IN PLACE,
rows never vanish (Loo: 不要消失,直接更新 Grid). **Issue ≠ Send** — nothing
reaches a factory until the Purchase Orders page's WhatsApp step, which is
why there is no confirm dialog.

**The engine's dates work FOR the operator (the thing AutoCount cannot do):**
- VIEWS are the engine's order-by dates: `Order today` (default; overdue
  merges in, red — issue now, hold nothing) · `This week` · `All` ·
  `Needs setup` (demand with no production days — named, never hidden,
  never selectable).
- Today's plan arrives **PRE-SELECTED**; daily flow = open → glance → press.
- Operator overrides are **DELTAS**: a refetch pre-ticks new rows and never
  overturns a human's tick (negative-controlled).

**The Portal Grid Workspace standard (frozen 2026-08-01 — Orders · Purchase
Orders · Receiving · Claims · Payments all reuse it):**

```
Top strip        the Orders page's own: breadcrumb + shared TopBarIcons
                 (alerts · help · settings). NO search (Loo's final cut).
Tabs             NAVIGATION only — no buttons, no KPI, NO H1 anywhere
                 (the lit tab is the page identity; a repeated title is
                 wasted height).
Workspace Panel  200px left, Gmail's rhythm, default EXPANDED:
                 VIEWS → FILTERS (slot) → GROUP → SORT (slot), in that
                 frozen order. Views ≠ Filters, never mixed. A section
                 joins when built, never as an empty heading.
Data Grid        the ONLY scroll area. Everything above is fixed.
Batch bar        appears only when there is something to say.
Page actions     Create Proposal · Columns · Export · Help, in that frozen
                 order, each appearing ONLY once built — a half-dead grey
                 button is worse than none. Refresh was ruled OUT (twice):
                 the plan updates itself.
```

**Other standing rulings:** one PO = one destination (arithmetic; the
Destination select sits on the GROUP header, never one global select — and
"send one item elsewhere" = Split, the door to direct delivery, v2) ·
`SearchInput` gained the kit `pill` shape (the Orders search, standardised)
· the group header carries NO `becomes N POs` echo (one fact one home: the
batch bar).

## 0 · What is on screen right now (deployed, PR #544)

`apps/web/src/pages/operation/OperationToOrder.tsx`, one file, assembly only.
Top strip (breadcrumb · TopBarIcons) → PurchasingTabs → Workspace Panel
(VIEWS with counts · GROUP Supplier/None) → the grid (sticky collapsible
group headers with per-group Destination; rows = ☑ · SO · customer · stock
ready date (red when past) · summary · qty) → batch bar (truth sentence ·
`Create Purchase Orders` · per-group results and `Retry N failed` ·
`Open Purchase Orders` after success). Flat mode (`Group: None`) = plain
rows with supplier · category riding each row, earliest stock-ready first.

**Deferred BY RULING (one card, one deploy):** v2 = `Own Purchase Order`
(split; per-PO destination; needs the missing customer-address destination
column, §12) · v3 = Ordered history (probably the Purchase Orders page's) ·
v4 = `Change Required Date` + `Cancel Purchase` (stored state + reasons) ·
Create Proposal's real manual entrance · FILTERS/SORT panel sections ·
Columns/Export/Help page actions · a Planning History line (needs an audit
write — `operation_create_pos_batch` writes NO audit row, measured §12).

## 1 · Business logic that must be kept

Unchanged from before — none of this is UI and all of it survived five
redesigns in one day untouched:

- **`packages/shared/src/to-order.ts`** — the whole projection
  (`buildToOrder` · `defaultDocuments` · `planPurchaseOrders` ·
  `validateIssuePlan` · `isOnePoPerOrder` — sofa one PO per order) **plus
  `TO_ORDER_WORDS`, the ONE word list. A string not here has not been
  ruled.** New composers: `soCountLabel` · `pcsCount` · `soSelectedLine` ·
  `willCreateLine` · `ordersHeadline` · `railItemLabel`/`sizeShort`.
- **`apps/web/src/pages/operation/to-order-preview.ts`** — the arrangement
  state machine, now with the `excluded` half (`toggleBuild` ·
  `setBuildsIncluded` · `effectiveDocs`): membership without removal, and
  the WIRE only ever sees shapes the server has always accepted (a fully
  excluded doc goes out whole as `include:false`). The split/move machinery
  is intact and is v2's engine.
- **`apps/api/src/routes/operation/to-order.ts`** + **`operation_create_pos_batch`**
  — the read and the one-transaction issue write, untouched.
- **The write contract, unchanged and not to be widened:**
  `POST /api/operation/purchase/to-order/issue` `{ supplierId, category,
  destinationId, purchaseOrders: [{key, include, buildKeys}] }` — the batch
  is N of these, one per group, sequential. The client posts an ARRANGEMENT
  and nothing else (negative-controlled: no sku/qty/cost/price in any body).

## 2 · Kit pieces this page proves

`Checkbox` (rows · group tri-state) · `Select` (per-group Destination) ·
`Button` · `EmptyState` · `Loading` · `Icon` · **`SearchInput` gained the
`pill` shape** (controlClass's third shape — radius moved out of
CONTROL_BASE) — unused on this page after Loo's final cut, standard for the
next page. The grid itself is page-local div-rows (tokens only, no
hand-rolled `<table>`/`<input>` — the scan's rule G stays untouched).

## 3 · Files that are the source of truth

Unchanged: `docs/01-design-tokens.md` · `docs/02-components.md` ·
`docs/03-page-patterns.md` (this page's shape needs its Carres Example
REWRITTEN — the Review example there still describes the dead five-region
workspace; next docs card) · `packages/shared/src/to-order.ts` ·
`docs/COPY-STANDARD.md` · this file. `docs/UI-KIT.md` ⛔ superseded, bridge
only.

## 4 · The method: build new, delete old — executed AGAIN

The Navigator (C+), the card queue, the Commands layer, Planning & Audit,
the workbench, the removed-strip: all deleted whole in #544, not annotated.
Five intermediate designs in one day left ZERO dead code because none of
them was deployed — ASCII-first is what made five U-turns affordable.

## 5 · Words owed to COPY-STANDARD (all ruled by Loo 2026-07-31/08-01)

On screen now: `Order today` · `This week` · `All` · `Needs setup` ·
`cannot be planned` · `No production days for this supplier × category. Set
a number in Settings.` · `Views` · `Group` · `Supplier` · `None` · `Select`
· `Create Purchase Orders` · `Retry` · `created` · `failed` · `{n} SO` ·
`{n} pcs` · `{x} of {y} SO selected` · `will create {n} Purchase Orders` ·
`Order by {date}` · `Purchasing › To Order` (breadcrumb).
RETIRED from the screen (words deleted from the mirror where nothing else
uses them): `Ready to issue` · `Plan for` · `Work out the plan again` · the
six bucket words · `Customer Order` (source line) · `Planning & Audit` ·
`System generated from` · `Include in this issue` · `Not on any purchase
order` · `Put back` · `Remove` · `Refresh` · `becomes {n} POs`.
Still in the mirror, not rendered: `Create Proposal` (the architecture
slot) · the Items-section words (v2's).

## 9 · Rules that survive, and cost real money when broken

All previous entries stand (the `.in()` SKU trap · a surprising number is a
measurement to check — `data-late 0→0` in §15 is the day's example: a STALE
marker from a superseded iteration, not a missing feature · a negative
control that does not fail measures nothing · one fact one place). New:

- **After a squash-merge, never push more work to the same branch** — every
  PR this session was cut fresh from main (#544 after #543).
- **Date-fused test fixtures break at month-end**: `OrderStatusPage.test` +
  `BdOrdersBoard.test` (10 fails) died when July became August — proven
  pre-existing with a stash; fix chip spawned. The T7 lesson, twice more.
- **A worktree has no `.env.local`** — a fresh worktree's dev server cannot
  log in until `apps/web/.env.local` is copied from the main checkout.

## 12 · Columns and tables that do not exist

Unchanged from before, plus the ones today's rulings need:

```
po_sends · purchase_orders.approved_by · revision lock · suppliers
address/tel/attn/terms · purchasing_destinations.address (3/3 NULL) ·
purchase_orders.expected_ready_date (nobody writes it) ·
a destination meaning "this PO's customer"        ← v2's split needs it
a purchasing required-date override + reason      ← v4 Change Required Date
a purchase-cancel record + reason                 ← v4 Cancel Purchase
an audit row from operation_create_pos_batch      ← the Planning History line
```

## 14 · Baselines (re-measured on the deployed tip `11480656`, 2026-08-01)

| | |
|---|---|
| shared | **2023 / 2023** |
| api | 3 pre-existing (`partner/pickups` ×1 · `supplier/pos` ×2) |
| web | **16 documented** (`OperationOrders` ×7 · `OhanaSofaTab` ×4 · `OrderCustomerCard` ×4 · `NiceFutureMattressTab` ×1) **+ 10 date-rollover** (`OrderStatusPage` ×6 · `BdOrdersBoard` ×4 — pre-existing, proven with a stash on 2026-08-01; fix chip spawned). Page suite **18/18** · preview machine **4/4** · kit **115**. |
| tsc | web clean · api 4 (`rental-sell.test.ts`) |
| design-standard | **8438** — unchanged; the ratchet may never rise (it caught a 12px breadcrumb icon mid-build and forced it to 14) |

**Negative controls, proven not assumed**: the pickedDoc-reset regression
fails exactly 1 test · the arrangement-only POST refuses sku/qty/cost/price
· delta memory survives a lens round-trip · a failed group fails ALONE and
Retry re-posts only it.

## 15 · Deployed

```
Main tip     11480656 (PR #544 — To Order = the Excel grid + the frozen
             Portal Grid Workspace standard; #543 docs receipt merged first)
Web bundle   index-DrcPnNxZ.js · 4,589,917 bytes · SERVICE_ROLE 0
             carres-portal bc72fef6 + carres-pos a86efce1, both --branch=main
             ALL 4 canonicals converged on the FIRST poll
             live bundle md5-identical to the local build (6529f842…)
API Worker   ff17e0d1 DEPLOYED with --env production — packages/shared
             changed (words, composers, projection helpers the Worker
             imports), so web-only would have split the tips. Bindings
             echoed (PUBLIC_WEB_URL=pos.carresofficial.com + custom domain
             + 09:00-MYT cron); GET /health → 200 {"ok":true}
Migration    none
Bundle grep  both directions vs live predecessor index-AKa9Ahbj.js
             (downloaded BEFORE the deploy replaced it, at its recorded
             4,616,348 bytes). NEW: to-order-panel · to-order-batch-bar ·
             to-order-header-strip · to-order-lens-today · Order today ·
             Create Purchase Orders · cannot be planned each 0→1 ·
             Needs setup 1→2 · will create  1→2. RETIRED: to-order-bucket- ·
             to-order-commands · Work out the plan again · Planning & Audit ·
             System generated from each 1→0. `data-late` 0→0 was CHECKED,
             not explained away: a stale marker from the superseded C+
             iteration — the grid shows overdue as red dates.
PR trail     #543 (docs receipt) merged first · #544 cut FRESH from the
             new main tip (the after-a-squash lesson, applied) · both
             merged on Loo's explicit "deploy" order.
```

**No authenticated screenshot** — operation login; the md5 + both-direction
grep is the proof. Loo reviewed every iteration live on
`http://localhost:5221` (launch entry `web-planning`, added to
`.claude/launch.json` in this worktree) before ordering the deploy.

**Next steps (each its own chat + deploy):** v2 `Own Purchase Order` +
per-PO destination + the customer-address destination column · v3 Ordered
history · v4 `Change Required Date` / `Cancel Purchase` (+ storage) ·
Create Proposal's manual entrance · the Orders-page migration onto the
Portal Grid Workspace standard (LAST, after the standard survives a week of
real use) · rewrite `03-page-patterns.md`'s To Order Carres Example (it
still describes the dead five-region workspace).
