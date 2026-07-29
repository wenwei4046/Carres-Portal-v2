# Purchasing execution queue — ONE CARD PER CHAT (line ⑦, opened 2026-07-27)

> **How to use (Jess):** new chat, paste:
> "Read `docs/purchasing-execution-queue.md`. Do card P<n> ONLY. Do not touch any other
> card. Do not redesign anything marked ALREADY EXISTS."
>
> **THE FLOW IS `docs/PURCHASING-WORKING-FLOW.md`** — nine sections, every action with its
> six things plus what it is counted per and what re-checks it. This file says WHAT to
> build; that file says HOW purchasing works. **The WORDS are the dictionary in
> `docs/COPY-STANDARD.md` — five strings per action, already written. Do not invent one.**
>
> **Lane rule:** P-cards edit the Purchasing pages — the same lane as ④ R-cards and ⑥ C4.
> Never run a P-chat alongside an R-chat or C4. A P-chat MAY run alongside a T/J/C1-C3
> chat (Orders lane) or an S-chat (Service).

## Ground truth (read before ANY card — measured on prod 2026-07-27)

- **The engine already exists and mostly works.** `buildPurchaseTodayReport`
  (`packages/shared/purchase-report.ts`) computes net requirements, the order-by date and
  the urgency buckets. `apps/api/src/routes/operation/purchase.ts` already reads a
  per-category lead time, a per-supplier work week, an arrival buffer and a **Mon/Wed/Fri**
  cadence. **This line is not a rebuild.** Anyone who proposes one has not read the code.
- **The numbers are hard-coded and the code says so.** `DEFAULT_LEAD_DAYS`
  (sofa 10 · bedframe 7 · mattress 7) · `SUPPLIER_OFF_DAYS` (keyed by CATEGORY, not
  supplier) · `ARRIVAL_BUFFER_WORKING_DAYS = 7` · `DEFAULT_REVIEW_DAYS = [1,3,5]`. Their own
  comments read *"editable via 0243 later … pending Jess"*. **Jess has now decided** —
  §2 of the flow file holds every value.
- **`suppliers.lead_time` is free TEXT and 8 of 10 suppliers are empty** (only Ohana
  "7-21 days" and Nice Future "7-10 days"). Nothing can compute from it.
- **THE NUMBERS ARE BEHIND FOUR DOORS, NOT ONE** (measured 2026-07-28 — P1 must close all
  four or it has not done its job):
  1. the hard-coded constants in `apps/api/src/routes/operation/purchase.ts`;
  2. **`PurchaseSettingsSheet.tsx`** — a read-only "Purchase settings" drawer already live
     behind the gear icon on the Purchasing tab bar, showing **PO days = Mon + Thu** (the
     engine runs Mon/Wed/Fri) and **Bed frame = Mon–Fri** (Ohana works Saturday). **A manager
     opening Settings today reads two numbers that are false;**
  3. **`delivery_fee_config.mattress_bedframe_lead_days` (14) and `sofa_lead_days` (21)** —
     two editable fields on Catalog → Delivery that **no code reads**. The real gate is the
     hard-coded `DELIVERY_LEAD_DAYS`. Editing them today changes nothing;
  4. `suppliers.lead_time` — free text, and after P1 it is a second place claiming to say how
     long a factory takes;
  5. **`PO_STOCK_LEAD_DAYS` in `packages/shared/src/schemas/ops-po-duty.ts` — mattress 7 ·
     bedframe 7 · SOFA 5.** This is the URGENT BYPASS: an order whose deadline falls inside
     this window jumps the Mon/Wed/Fri cadence and flags red on any day. It is live on the
     Orders control grid (`poUrgentBypass`), it is **the safety net**, and it is calibrated to
     a sofa taking 5 working days when the flow says 14. **The net fires nine days too late.**
     Sofa therefore has FOUR different numbers in the codebase today (10 · 5 · 14/10 · 14) and
     P1 must leave exactly one.
- **Only TWO suppliers can be purchased from** (live 2026-07-28): Nice Future × mattress
  (42 SKUs) and Ohana × bedframe + sofa (154 SKUs) — **three supplier × category pairs.** The
  other 8 suppliers carry ZERO SKUs. The settings matrix is DERIVED from which supplier
  actually has SKUs in a category; a 10 × 3 grid of empty boxes is the wrong screen.
- **Zero purchase orders exist.** `purchase_orders` = 0 rows. Every P-card must prove its
  path works by creating a real PO, not by reading an existing one.
- **The live migration tail is AHEAD of the repo.** 2026-07-28: the tracker holds `0301` +
  `0302` (the ④ R6 warehouse-login line) and neither file is on main. Number from the
  TRACKER, never from `ls supabase/migrations`.
- **One warehouse exists and one is all there will be**: `Carres Klang`. AL Sungai Buloh and
  HOUZS Balakong are **delivery addresses on a PO, never warehouse records** (Loo 2026-07-28).
- **`purchase_order_lines` already carries** `qty` · `received_qty` · `damaged_qty` ·
  `wrong_item_qty`, and that is the whole quantity model. Partial receiving is already
  quantity-based. **There is no `cancelled_qty` and none is coming** — purchasing does not
  model a cancellation (flow file §9).
- **Claims is ALREADY A TAB.** R2 added it 2026-07-27 (`PurchasingTabs.tsx` → `?tab=claims`);
  the engine is live (R2 · R3 · R4, `supplier_claims`, migrations 0288/0291/0299). Four of the
  five tabs exist today; Settings is the fifth and arrives with P1.
- **Everything in the database today is TEST data.** At go-live it starts clean. Never
  write a backfill or a repair job for existing rows.

---

## P1 · The numbers become settings

**Goal:** every number the purchasing engine uses stops being hard-coded and becomes
something Jess edits, with a record of who changed it and what it was before.

**ALREADY EXISTS — do not rebuild:** the engine, the order-by computation, the urgency
buckets, the Mon/Wed/Fri cadence, the working-day calendar
(`packages/shared/working-days.ts` + `my-holidays.ts` — purchasing NEVER computes its own).

**Build:**
1. A settings store for the numbers in `docs/PURCHASING-WORKING-FLOW.md` §2. **They are FOUR
   shapes, not one:** production time is per supplier × category · supplier work week is per
   supplier · PO days is a set of weekdays · the rest are single numbers.
2. **Sofa production time becomes 14 working days** (it is 10 in the code and 5 in a stale
   Orders comment — three different numbers today, all wrong). **Peak season is not a second
   set of numbers** — it is a manager raising this one to 20 and lowering it again (§2).
3. The supplier work week moves from being keyed by CATEGORY to being keyed by **supplier**
   (Nice Future 5-day · Ohana works Saturday). The category proxy is a known lie.
   **Sunday is never offered** — it is a non-working day for everyone (working-days law), and
   a checkbox for it would read as though it could be switched on.
4. A **Settings** tab on Purchasing, manager-only (`org_duties` key `ops_manager` — **no new
   duty key**), laid out per UI-KIT §8.3 (module-tab law) + §8.2 (interaction law). Every
   edit records who, when, and the previous value, and the previous value is ON SCREEN.
5. **Close all FIVE doors** (Ground truth above), not just the constants: delete the
   constants with NO fallback · retire `PurchaseSettingsSheet.tsx` and its gear icon · retire
   the two dead fields on Catalog → Delivery · stop `suppliers.lead_time` claiming to answer
   this question · **make the urgent bypass (`PO_STOCK_LEAD_DAYS`) read the same setting**.
   A fallback is how a setting silently stops mattering; a second door is how a manager edits
   a number and nothing happens; and the fifth door is the safety net firing late.
6. `DELIVERY_LEAD_DAYS` (the POS's earliest sellable date — mattress/bedframe 14, sofa 21
   CALENDAR days) becomes **one** editable number. **Seed 21** — the safe upper bound, so no
   order becomes sellable EARLIER than it is today. Jess sets 30 at go-live, on screen.
7. **A supplier × category with no number set is not defaulted to 7.** The row reads
   `Set a number` (K1's law) and that line's order-by date is not computed. A quiet screen
   must mean *watched and fine*, never *nobody looked*.
8. **This deploy changes exactly ONE behaviour: sofa 10 → 14.** Order-by buffer stays 7 (Jess
   sets 10 at go-live herself). One number at a time, so a surprise is traceable.

**Migration:** yes — a settings table. Draft to Jess first (guardrail #8); number from the
TRACKER at apply time, not from the repo (the tail is ahead — Ground truth).
**Order of operations:** apply the migration and verify it FIRST, then merge, then deploy.
Shipping code whose table does not exist yet 500s the Purchasing page.
**Done when:** Jess changes sofa production time on screen and the order-by date on the To
Order tab moves the same day; no purchasing number is hard-coded anywhere; and the gear-icon
drawer and the two Catalog → Delivery fields are gone.

### ✅ SHIPPED — what actually landed (2026-07-28)

Migration **0303** · four tables (`purchasing_settings` singleton ·
`purchasing_supplier_settings` · `purchasing_production_days` ·
`purchasing_setting_changes`) · four audited DEFINER RPCs, manager-gated on the existing
`ops_manager` duty — **no new duty key**. No table carries a write policy, so the
gate cannot be walked around over PostgREST.

**The rule that shaped the build (Jess 2026-07-28): a supplier × category with no number
does NOT fall back to 7.** `productionWorkingDaysFor` returns `null`, the line is held out
of the plan, the To Order tab names the pair, and the Settings screen says `Set a number`
(K1's rule). There is deliberately no per-category default column to fall back on, and a
sanity block in the migration fails if one ever appears.

**All FIVE doors closed:**
- `PurchaseSettingsSheet.tsx`, the read-only gear on To Order, **deleted**. It showed
  PO days as **Mon + Thu** (four days after Jess moved to Mon/Wed/Fri) and promised the
  values would become editable "when the lead-time table ships". This is that table.
- `delivery_fee_config.mattress_bedframe_lead_days` / `sofa_lead_days` — **editable in
  Catalog → Delivery, saved on every click, and read by nothing.** The inputs are retired;
  the columns stay (nothing is dropped) with no writer.
- `suppliers.lead_time` — free text ("7-21 days"), empty on 8 of 10 suppliers, printed as
  a `Lead time` stat on the Suppliers card and appended to its drawer subtitle. **Both
  retired**; the column is untouched in the DB, it simply stops being shown as an answer.
- **`PO_STOCK_LEAD_DAYS` — the urgent bypass, the fifth door — DELETED.** `poUrgentBypass`
  now takes a window in days, and its callers resolve that window from the production
  working days a human set (`purchasingUrgentWindowDays`, the LONGEST across the categories
  an order is short on — the safe direction: it flags early, never late). **A category with
  no number set gets a window of 0 and can never make an order urgent**, which is the same
  silence `Set a number` buys everywhere else, asserted by its own test.
- The constants themselves — **deleted, no fallback.**

**The safety net stops firing nine days late.** Sofa carried FOUR numbers (engine 10 ·
bypass 5 · the gear drawer 14/10 · the flow 14); the bypass now reads the same 14 as the
plan does, so an unsecured sofa order jumps the cadence when the flow says it should.

**Six of the seven numbers, plus one the card did not list.** `logistics_call_working_days`
(§2's "days before the delivery date the logistics call is raised") IS built and IS read —
Jess ruled on 2026-07-28 that a column with no reader is `ops_order_control.balance`'s
disease, so the two Orders-lane readers were wired in the same PR, changing nothing else.
Its label on screen is the action it raises (`Confirm delivery date`), because no word for
the setting itself exists in COPY-STANDARD.

**One behaviour change only** (Jess): sofa production time 10 → 14 working days. The
order-by buffer stays at today's 7 and the earliest-sell number collapses to **21** — the
upper of today's 14/21, so nothing becomes sellable EARLIER than it is today (a mattress
cart tightens from 14 to 21; Jess sets 30 at go-live).

## P2 · The click behaviour becomes real

**This card SHRANK on 2026-07-28.** Its old goal was "Claims becomes a tab" — **Claims is
already a tab.** R2 added it on 2026-07-27 (`PurchasingTabs.tsx` → `?tab=claims`), so four of
the five tabs in `docs/PURCHASING-WORKING-FLOW.md` §1 exist today and the fifth (Settings)
arrives with P1. Nothing about tabs is left to build.

**ALREADY EXISTS — do not rebuild:** the claim engine and its lifecycle (R2 · R3 · R4), the
Claims tab, the Receiving tab, the tables.

**The facet rail exists on ONE tab of four, not on all of them** (measured 2026-07-28 — the
earlier version of this card said "the facet rail" already exists, full stop, and a chat that
believed it would go looking for something that is not there):

| Tab | Facet rail | Filter state | What P2 owes it |
|---|---|---|---|
| **To Order** | yes | **ONE live, TWO dead** — `supplierFilter` works; `attn` and `selectedDay` have state, filter logic and a clear chip, and **nothing on the page can switch them on** (their tiles were deleted 2026-07-23/24 and the state stayed). See the ruling below | ✅ done #492 |
| **Purchase Orders** | — | — | check before building; it is a nested route, not a `?tab=` |
| **Receiving** | ~~none~~ **yes** | ~~none~~ **3 live, all toggling** | ✅ done #495 — a queue page, not a stage page |
| **Claims** | ~~none~~ **yes** | ~~none~~ **3 live** | ✅ done #494 — a rail and tiles from scratch |

**Build — the UI-KIT §8.2 interaction law:** click a queue tile → the table filters · click it
again / ✕ → it clears · two tiles → two ✕-able chips · click a row → the drawer opens on its
FIRST tab · closing keeps the filter AND the scroll position. **Orders is the reference — copy
it, do not invent it.**

**The three stage cells are NOT queue tiles and do not toggle** — exactly one is always on and
clearing would blank the page. §8.2 gained the rule that says so (the no-empty-state shape),
written after P2 found that the law assumed every list has an "everything" view. Their WORDS
are wrong (`Send POs` · `Chase factory` · `Receive`, and `Chase` is banned) and that is **R8's
sweep, not P2's** — a rename is not a click behaviour.

**The two dead filters — ruled 2026-07-28: DELETED, and R8 does it.** `attn` and `selectedDay`
are state with filter logic and a clear chip that nothing can turn on. Loo ruled them out of
the code rather than back onto the screen, and the work sits in **R8 ⓪b** because R8 is already
opening this file for the stage-cell rename — one visit, not two. **It is a deletion, not a
decision to drop the feature:** "only what is late" and "only this day" were never ruled
unwanted, they were ruled *not to sit in the code pretending to exist*. Either one comes back
as a card that starts by naming its words (`Late only` is in no dictionary today).

My own earlier version of this card called all three filters "real, each with an onClear chip"
— read off a grep, and wrong. P2 measured it and reported it, which is the only reason it is
not still described as live here. Two dead filters a card describes as working are
`ops_order_control.balance` in miniature: the next chat plans around a feature nobody can reach.

**Do NOT extract a shared component for this.** UI-KIT §8.2's enforcement row says the
behaviour ends up inside `PageShell` / `DataTable`, and **that is card D0.5c on line ⑧**.
P2 makes the behaviour true on Purchasing; D0.5c is what stops it being written a fourth time.
A P-chat that starts building `PageShell` has taken another line's card.

**The queue tiles are the six in `docs/PURCHASING-WORKING-FLOW.md` §7**, and the sixth is
`Confirm what happens next`, NOT `Claims` — a tile's name is its action; `Claims` is the tab.

**LANE — read before opening a chat.** Receiving and Claims are ④ R's files, and **R6
(`warehouse files its own receiving`) is mid-flight**: `0301` / `0302` are applied to prod and
neither file is on main. P1 could ship beside R6 because it touched neither. **P2 touches
`OperationReceiving.tsx` directly.** Either wait for R6 to merge, or ship the To Order half
alone and leave the other two tabs until it lands — but never edit that file while R6 holds it.

**No migration.**
**Done when:** every queue tile on Purchasing filters and clears again, and the drawer gives
the list back exactly as it was left.

### 🟡 PARTIALLY DONE — the To Order half shipped 2026-07-28 (PR #492)

**DEPLOYED** — web `index-c7LT9aSQ.js` from main tip `10f49add` (carres-portal `4523c8cf` +
carres-pos `f22c7dcc`, both `--branch=main`; `wrangler pages deployment list` names
`10f49ad` the newest Production/main writer on BOTH projects). **No api deploy**:
`git diff 9fe094bf..HEAD -- apps/api packages/shared supabase/migrations` is empty, so the
Worker R6 deployed an hour earlier already matches this tip. **Proved BOTH directions on
downloaded bundles** (4,486,379 bytes, `SERVICE_ROLE` 0): `facet-stage-place` ·
`facet-stage-chase` · `facet-stage-receive` · `facet-supplier-` · `place-row-` each grep
**0** in the previous live bundle (`index-DCTBedJr.js`, fetched from its OWN deployment URL
— a superseded asset 404s at the apex) and **1** here. The canonicals flapped between the
two hashes for several minutes, which is the documented edge-cache behaviour; the
deployment list is what settles it.

**Done: To Order.** No migration, no new word, no extracted component.

- **Clicking the same PO again clears it.** It never did: the row already toggled
  `selection` to null and the auto-select effect put the first row straight back on the
  next render, so "click again to clear" silently meant **"select a different factory's
  PO"**. `selectionCleared` tells those effects the empty selection was ASKED FOR, and it
  covers all three stage lists so Send / Chase / Receive get one rule, not three.
- **Clicking the stage you are already on is a no-op.** `goStage` used to re-run its whole
  reset, so a second click on `Send POs` threw away the supplier filter the operator had
  just picked — the exact opposite of the law it sits under. **A stage is not a filter:**
  there are three, one is always on, and there is no cleared state to toggle into.
- **Closing a drawer gives the list back.** `CreatePOModal` (Send PO · + New PO · Send
  separately) and `ReceivePOModal` (Check in) snapshot the filters, the selection and the
  facet rail's scroll on open and restore them on close. **The rail is the scroll target**
  because the middle list was folded into the tree on 2026-07-24 — the rail IS this tab's
  list. The scroll re-applies after each render until it sticks, because the `refetch()`
  that runs on close re-lays the tree out a frame or two later.
- The supplier facet cell already obeyed §8.2 and is unchanged — it now has a test.
- `OperationPurchase.tsx` had **no test file at all**; the first one is 8 tests, each with
  its negative control run (drop the cleared guard → exactly 4 fail · drop the stage guard
  → 1 · drop the restore → 1).

**Still owed when the To Order half shipped: Receiving and Claims.** Both needed a facet rail
and tiles from scratch, and both live in ④ R's files (`OperationReceiving.tsx` ·
`OperationSupplierClaims.tsx`), which **R6 held when To Order ran** — the card's own LANE
paragraph says to ship the To Order half alone rather than edit a file another line holds.
**R6 has since merged (PR #490, `9fe094bf`), so that block is gone.** Claims took its own chat
and shipped as #494; Receiving took its own and shipped as #495. **Both are below, and P2 is
now complete on all three tabs that have a list.**

**Reported, not fixed (Law 0):**

1. **Two of the three filters this card names are UNREACHABLE.** The table above says To
   Order carries `supplierFilter · attn · selectedDay`, "each with an `onClear` chip".
   Measured 2026-07-28: `attn` and `selectedDay` have state, filter logic and a clear chip,
   and **nothing on the page can set either** — the NEEDS-ATTENTION facet section and the
   days-to-order strip were both deleted on 2026-07-23/24 and the state was left behind. A
   filter that can be cleared and never set is `ops_order_control.balance`'s disease in its
   other form. Giving them tiles needs words (`Late only` · `No deadline`) that are **not in
   COPY-STANDARD**, so nothing was invented — and nothing was deleted either, because this
   card names them as live state. Jess rules which.
2. **The three stage cells are queue tiles that cannot toggle.** §7 names the tiles and §8.2
   says a tile clears on re-click; this page has no unfiltered state to clear INTO — the
   body renders a stage-specific layout, so a cleared stage is a blank page. Making them
   real toggles is a rebuild of the tab, not P2.
3. **The stage cells are also worded off-dictionary** — `Send POs` · `Chase factory` ·
   `Receive`, where the dictionary locks `Send PO` · `Confirm ready date` · `Check in`, and
   **`Chase` is a banned word**. Same disease as the `Contact` → `Call` rename already
   carded as **R8**; worth folding in there rather than opening a third.

### ✅ The CLAIMS half shipped 2026-07-28 (PR #494)

**No migration. Web only. No new word anywhere on the page.**

`OperationSupplierClaims.tsx` had **no facet rail and no filter state at all**, so not one line
of §8.2 could be true on it. It now runs the Orders rail — `ListPageShell` + `SectionCard` /
`SectionBand` + a row per facet value — copied from the sibling To Order tab rather than
invented.

| Group | Rows | Why it may exist |
|---|---|---|
| `Queues` | **`Confirm what happens next`** | COPY-STANDARD's PURCHASING dictionary row, verbatim. **A tile's name IS its action**; `Claims` is the TAB. Its count is the claims where `claimNextMove` says the supplier still owes an answer — which is exactly what its locked empty state says |
| `Supplier` | one per supplier on the list | a FACT, and a filter is fact-only (UI type dictionary). The word is this table's own column header |
| `Problem` | one per claim type | same, with the labels the Problem column already prints, from the one shared module |

- **Click a tile → the table filters · click it again, or its ✕ chip → it clears.** Two picks are
  two chips and each ✕ clears only its own.
- **The whole ROW opens the claim**, not only the `Open` button — it opens from the top, and this
  surface has no tabs to land deep in.
- **Closing gives the list back**: the filters and the table's scroll position. Opening a claim
  inserts a tall panel row and closing takes that height away, so the browser clamps `scrollTop`
  underneath the operator; the position is snapshotted on open, restored on close and re-applied
  after each render until it sticks (a mutation inside the panel refetches and re-lays the table
  out a frame or two later). It fires when a FILTER takes the open claim off the list too — the
  one case where the panel vanishes with nobody clicking is the one case that jumped.
- **`Open / Closed / All` is a STAGE picker** (§8.2's no-empty-state shape, the rule To Order
  added): one is always on, there is nothing to clear into, so re-clicking the active one is a
  **no-op**; a different one is a different list and clears the picks.

**The one design decision worth re-reading: each group is counted with every filter EXCEPT its
own, and a zero row is not rendered.** That is what makes the rail honest — a visible cell above
zero always returns at least that many rows, so **no reachable click can blank the table**. The
one place a blank table IS reachable is the queue tile at zero, deliberately: the tile renders at
0 because a quiet screen must mean *watched and fine*, never *nobody looked* (K1's law), and
clicking it prints the dictionary's own sentence instead of a shrug.

**Every new guard has its negative control run** — drop the stage no-op guard → exactly 1 test
fails · the `stopPropagation` → 1 · the scroll restore → 3 · the cross-facet count exclusion → 1.
**The `stopPropagation` test had to be rewritten to be worth anything**: with the row a click
target, two handlers firing for one click is invisible on the panel (both toggles read the same
render's state and agree) and **not** invisible on the scroll — the second close reads a snapshot
the first already spent.

**Reported, not fixed (Law 0):**

1. **The dictionary gives Claims ONE queue word and the engine computes THREE steps.**
   `claimNextMove` runs ask → answer → close, and only the middle one has a name
   (`Confirm what happens next`, whose empty state pins it to *waiting for a supplier answer*).
   So the two CARRES-side steps — decide what we want done, and settle it — have a count nowhere
   and can get no tile without words Jess has not ruled. **Nothing was invented.** Whether they
   deserve tiles is her call; if they do, it starts with five strings each.
2. **The tile and the row spell one action two ways, live, right now.** The tile reads
   `Confirm what happens next`; the row's Next move column reads R3's own sentences
   (`Call Ohana — agree the fix` · `— confirm what they will do` · `Close SC-1001 — Ohana
   refused`), where the dictionary's row line is `Call {supplier} — confirm what happens next`.
   This is precisely what C1's shared word module exists to make impossible. **It is ④ R8's
   rename** (its own done-when names the Claims queue tile) and a rename is not a click
   behaviour, so P2 left every one of those strings alone.
3. **`supplier-claim.ts`'s own comment is now stale and reads as an open question that is
   closed.** It says *"`Close` is the only verb here outside COPY-STANDARD's four-verb dictionary
   (Assign · Call · Issue · Upload) … FLAGGED for Jess rather than silently adopted."* The verb
   table is **six** now and **`Close` is one of them** (locked 2026-07-27/28). The code is right
   and the comment is a year of confusion waiting for the next reader. One-line fix, and it
   belongs to whoever next opens that module for a real reason.
4. **The facet counts describe a capped page; the tab chips describe the truth.**
   `GET /api/operation/supplier-claims` returns `DEFAULT_LIMIT = 200` rows and computes the
   Open/Closed/All chips from a SEPARATE unfiltered head-count — deliberately, and its comment
   says so. The rail counts the array it was handed, so past 200 claims a facet count and its tab
   chip stop agreeing. **Invisible today (0 claims live)** and the same shape as the
   `principal-dealers-join-unbounded` carry-forward; the fix is server-side facet counts, not a
   bigger cap.
5. **A page description sits above the list and §1.1's gate would not admit it.** *"What the
   supplier still owes us…"* is a permanent band on a page whose budget is ≤200px of fixed chrome,
   and it explains rather than works. **P2 did not delete it** — removing copy nobody asked to
   rule on is not a click behaviour — but it is the first thing to go when this page is measured.
6. **Facet GROUP titles have no home in any law.** §8.4 orders the groups
   (`SUMMARY → the module's queue names → STOCK → LOGISTICS → REGION → CATEGORY`) and
   COPY-STANDARD's dictionary is per-ACTION, so `Queues` · `Supplier` · `Problem` are words no
   document owns. P2 reused words already on screen (the Orders rail's, and this table's own
   column headers) rather than invent, but the next module that builds a rail has nothing to
   check itself against.

### ✅ The RECEIVING half shipped 2026-07-28 (PR #495)

**Done: Receiving.** No migration, no api change, no new word, and the interaction law is
true on the tab. What was there before: **no facet rail and no filter state at all** — the
earlier table in this card said "ALREADY EXISTS: the facet rail", which was true of To Order
only, and the Receiving row was corrected to `none / none` before this ran.

**The shape decision is the first thing the card owed, and it is written down.** §8.2's new
rule (added by the To Order half) says a picker with no "nothing selected" state is a STAGE
and re-clicking it is a no-op. **Receiving is the OTHER shape.** Its `All` tab is a legal and
genuinely useful nothing-selected view — it is how an operator finds one PO — and the body
renders ONE table for every combination of filters, so a cleared tile shows every row rather
than a blank page. Therefore every tile toggles and every pick is an ✕-able chip. To Order is
a stage page for exactly the opposite reason.

**The rail, in §8.4's order, danger group first:**

| Group | Rows | Where the words come from |
|---|---|---|
| `Today's work` | **`Check in`** | the ONE action of `PURCHASING-WORKING-FLOW.md` §7 that lives on this tab |
| `Progress` | `Receiving issue` · `Partially received` · `In transit` · `Fully received` | the page's own R1 column (`packages/shared/po-receiving.ts`) |
| `Supplier` | one row per factory | the same facet the To Order tab carries |

**Only ONE of §7's six tiles is on this tab, and that is a finding, not a shortfall.**
`Send PO` and `Confirm ready date` are To Order's · `Confirm what happens next` is the Claims
tab's · `Confirm tomorrow's delivery` and `Confirm balance delivery date` are **P3, not built
yet**. A tile for an action nothing can count would be a number nobody wrote — the
`ops_order_control.balance` disease with a queue name on it. **When P3 lands, its two actions
get their tiles in this same band.**

**`Check in` is counted by QUANTITY, which is §9's own rule** — *"A PO is finished by
QUANTITY, never by the existence of a receiving record."* So the tile reads
`poReceivingProgress().pendingDelivery`, **not** the stored `status` word the three status
tabs read, and a PO whose status still says `open` while its lines are fully received is
correctly NOT in it. A test states exactly that; re-pointing the tile at the status word
fires 3 tests. The band hides itself when the count is zero, so the `Received` tab shows no
`Check in` tile at all rather than a reassuring `0`.

**Closing the drawer gives the list back** — the tab, the search, all three filters and the
facet rail's scroll. The one overlay this tab opens is `ReceivePOModal` (the Check in form);
the scroll re-applies after each render until it sticks, because the refetch on close re-lays
the rail out a frame or two later. Written inline again rather than shared: that behaviour
belongs in `PageShell` / `DataTable`, which is **D0.5c on line ⑧**, and this card reserves it.

**One thing was extracted, and it is not the forbidden one.** `FacetRow` now renders on TWO
Purchasing tabs, and UI-KIT §6.1 is explicit: *"the second occurrence is a full stop: extract
it first, then use it twice."* It moved verbatim into `components/FacetRow.tsx`. What P2
forbids extracting is `PageShell` / `DataTable`, which own the BEHAVIOUR — untouched.

**The page also stops hand-rolling its own header.** It renders through `ListPageShell` with
no title, which is §8.3's module-tab law and what the sibling tab already does; the kicker +
`<h1>Receiving</h1>` + the strapline were ~80px of a 200px list budget spent repeating the
word already lit in the tab bar. **Nothing was renamed** — those three lines were deleted by
the law, not reworded.

`OperationReceiving.test.tsx` gained 9 tests, each with its negative control run (swap the
tile onto the status word → 3 fail · make the tiles non-toggling → 4 fail · drop the state
restore → 1 · drop the scroll re-apply → 1). Suites at baseline (web 2094 passed · 16
pre-existing); typecheck 0; build + lint + v4 guard clean; `SERVICE_ROLE` 0.

**Reported, not fixed (Law 0):**

1. **`Send back` is live on this page and the dictionary retired it.** COPY-STANDARD's
   warehouse-count words (Loo 2026-07-28) rule the two directions `Return count to Carres` /
   `Return count to {warehouse}` and state that `Send back` is retired because `Send` is
   pinned to raising a PO. R6's `WarehouseReceiptsPanel` on this tab still says `Send back`
   three times. **Not touched** — R8 owns the sweep and this card was told to leave R6's panel
   alone; but it is on the same screen the card just rebuilt, so it is named here rather than
   left for a grep to find.
2. **The row-click rung of §8.2 has nothing to open on this tab, so it was NOT invented.**
   §8.2 says a row click opens the drawer on its first tab. Receiving has no detail drawer —
   its only overlay is the Check in FORM, and a form is not a record view: opening it from a
   row click would mean a `Fully received` row opens a form with nothing to submit. The PO's
   detail lives on the Purchase Orders tab, which is a nested route, and navigating away is
   not a drawer (closing it could not "give the list back"). **RULED 2026-07-28 (Loo): NOT
   adopted.** A parallel chat had built exactly this (row opens the check-in form) and its PR
   (#496) is closed as superseded — **P2 is finished, and making a row open a form is a new
   product-behaviour decision that belongs to neither P2 nor R8.** The `Receive →` button stays
   the only opener. If a PO drawer is ever wanted it is its own card.
3. **The empty state does not know about the new filters.** It still reads
   `No purchase orders in this tab.` — accurate but not the whole truth once a tile is on
   (the active chips are on screen beside it). A filtered-empty sentence needs words nobody
   has ruled, so none were invented.
4. **`Factory: {name}` on To Order vs `Supplier: {name}` here.** The chips for the same facet
   spell the party two ways one tab apart. This page's own column header, §7's column list and
   the dictionary's `{supplier}` all say **Supplier**, so that is what the new chip says — and
   the To Order chip is now the odd one out. Rule 8 says one business fact, one word; **the
   fix belongs in R8's sweep**, not in a card about clicking.
5. **The status tabs and the `Check in` tile answer nearly the same question from two
   different stores.** `To receive` reads `purchase_orders.status`; `Check in` reads the line
   quantities, which is what §9 says is authoritative. They agree today because the receive
   RPC sets the status word, and the divergence is exactly the case §9 was written for. Two
   controls that usually agree and occasionally will not is worth Jess's word — the honest
   options are to leave both (today), or to re-derive the tabs from quantities, which changes
   what three existing words select and is therefore not a P-card. **RULED 2026-07-28 (Loo):
   BOTH STAY, as they ship.** The parallel chat's #496 had deleted the three tabs and moved
   their sets onto the rail; that PR is closed and none of it is taken — **deleting three live
   words is a product decision, not a click behaviour**, and a shipped page is not redesigned to
   make duplicated work useful. The overlap stays on record here, unfixed, until Jess opens it.
6. **The Claims half wrote a THIRD copy of the facet row.** #494 landed while this ran and
   hand-rolled its own row inside `OperationSupplierClaims.tsx`; this half then extracted the
   shared `components/FacetRow.tsx` per §6.1, so there are now two users of the component and
   one copy beside it. **Not fixed here** — that file belonged to a parallel chat and this one
   was told not to open it. It is a one-import change for whoever next has a reason to.

## P3 · The two missing supplier calls

**Goal:** build the two actions the portal has never had —
`Confirm tomorrow's delivery` and `Confirm balance delivery date`
(`docs/PURCHASING-WORKING-FLOW.md` §3; the five strings for each are already in the
dictionary).

**The business reason, in Jess's own words:** the day before the goods are due, a staff
member asks the supplier for the delivery order to confirm tomorrow's van — and that is when
the supplier says "it will be late". And when the van arrives short, somebody has to ask when
the balance comes.

**Build:**
1. `Confirm tomorrow's delivery` — appears the working day before the expected arrival,
   closes on a recorded answer (shipping / delayed with a new date), counted per PO.
2. **A "delayed" answer opens Delay planning** — the Orders flow's stage 1, unchanged. It
   never opens a call to the customer.
3. `Confirm balance delivery date` — appears when a line is part-received with no date for
   the balance, counted per PO line.
4. **Every supplier promise is kept as history**, not overwritten: previous date, new date,
   who, when, reason. A single "latest date" column can never answer *how often does this
   supplier move the date* — which is exactly what R5's scorecard needs.

**Migration:** yes — the answer records and the promise history. Draft to Jess first.
**Done when:** a supplier who says "late" on the phone the day before produces a Delay
planning action by itself, and a short delivery produces exactly one balance call.

### ✅ SHIPPED — what actually landed (2026-07-29)

Migration **0306** · **ONE append-only table** (`po_supplier_promises`) that is the answer
record AND the promise history, because §3's *"every promise is kept, not overwritten"* is only
structural when there is no column to overwrite — the CURRENT answer is the latest row. Plus a
`purchase_order_lines.short_since` stamp, a fail-closed `operation|principal` gate, and three
SECURITY DEFINER RPCs. **No write policy on the ledger**, so PostgREST cannot record a supplier
promise without recording who promised what.

**THE BUSINESS DECISION THIS CARD NEEDED, AND WHO MADE IT.** The card ties Delay planning to the
tomorrow call only. A balance date can also land after the customer's promised date, and P3
stopped rather than deciding on the business's behalf. **Loo ruled it 2026-07-29 (option A): a
new BALANCE delivery date enters Delay planning too** — *"the portal must surface every known
risk that may affect the Customer Delivery Window."* One delay model, reused: the date reaches
`ops_order_control.line_etas`, C8's ladder opens `Delay planning` by itself and 0305's trigger
starts the clock. **Nothing new was built for delay, and nothing about Delay planning changed.**

**⚠️ ACCEPTED TEMPORARY LIMITATION — merged-PO false positives, and it belongs to P5.** A PO
line MERGES several customers' quantities (§3: *"ten customers' bed frames from Ohana is one
PO"*) and **nothing in the data says whose units are the short ones.** So a balance date reaches
EVERY customer order the PO covers, and on a merged PO some of those orders are not really
delayed. Loo accepted this knowingly: it is an ALLOCATION gap, P5 is the card that closes it,
and the alternative — staying silent about the customers who ARE delayed — is worse. It is also
consistent with what the engine already believes: 0299's receive RPC advances a customer thread
only when `bool_and(received_qty >= qty)`, so a short PO line already leaves every linked
customer waiting. **A chat that meets this must not "fix" it by narrowing the push; it is P5's.**

**The card said the tomorrow call is "a one-day action" and that phrase is about the DUE.** Read
as the trigger — `eta === tomorrow`, exactly — the call would vanish at midnight with nobody
having closed it, and `ACTION-FLOW-STANDARD`'s opening sentence says an action leaves when its
COMPLETION becomes true and at no other moment. So the window opens on the working day before
the arrival (`eta <= the next OFFICE working day`) and stays open until answered; the Due is the
working day before the arrival, and it turns red after that.

**Both calls close only while the answer still describes the CURRENT facts** — S4's rule, the one
C8 made load-bearing in `delay_decision_eta`. The tomorrow answer stores the arrival date it was
made ABOUT; the balance answer stores the received quantity it was made ABOUT. A factory that
moves the date again, or a second short delivery, re-opens the call **by itself**. Without that
pair, one phone call would silence a PO forever.

**THE BALANCE CALL'S DUE HAD NOWHERE TO LIVE, and the card did not predict it.** §3 says it is
due *"the working day after the short delivery"* — and **nothing stored that day**: 0299's
`operation_receive_po_with_do` writes `received_qty` and never writes `po_receipts` (zero
references, measured). A Due that cannot be computed is one of Law 2's six things missing.
`short_since` is stamped by a **TRIGGER, not route code**, which is 0305's own discipline:
`received_qty` has three doors and a stamp one route writes is a stamp the other two walk
around. A line short before 0306 raises the call with **no Due and never late** — a deadline
nobody recorded may not be invented (T7: a step that cannot be late is not urgent).

**Every word is COPY-STANDARD's.** The two rows joined the dictionary mirror with all five
strings each; `Send PO` and `Confirm ready date` are still read back out of the ORDERS table
rather than respelt. **The chat stopped once and asked**, exactly as C8 did: the action asks a
question and COPY-STANDARD's answers table had ONE row (`Delay planning`). **Loo ruled the two
answers: `It ships on {date}` · `It ships later than {date}`** — they name the date because the
call stays open until it is answered, so `Shipping tomorrow` read two days late is a sentence
about a day that has gone. A test refuses any relative word in either.

**On screen:** the Receiving tab's `Today's work` band gains the two tiles, in §4's order, each
hiding at zero. **A row shows EVERY open call, never only the top one** (Law 1) — a PO delivered
short on Monday and expecting its balance van on Friday genuinely carries both. ONE record-answer
form serves both actions (UI-KIT §6.1).

**Live effect today: NONE** — 0 purchase orders, 0 lines, 0 promises. P3 decides the behaviour
before the first PO exists, exactly as C7, C8 and C9 did.

**Reported, not fixed (Law 0):**

1. **The balance tile counts POs while §3 counts the action per PO LINE.** This tab's ROW is a
   PO, and P2-Claims' honesty rule says a visible cell above zero must always return at least
   that many ROWS. So the tile prints the POs it will show and the ROW prints one button per
   short line — the per-line figure is visible, just not in the tile. A tile that counts lines
   over a list of POs would be the first facet in the portal whose number its own click cannot
   produce.
2. **The two tiles carry no tooltip, and the other tiles on that page do.** COPY-STANDARD's
   tooltip rule is *"if the tooltip would just re-state the label, delete the tooltip"*, and
   these labels are already whole instructions. Writing one anyway would have been an invented
   sentence on the day the answers had to be ruled. If Jess wants them, they are two strings.
3. **`Note (optional)` has no dictionary row anywhere**, so the form reuses the order drawer's
   own live string verbatim. C8 met this exact square and made the same call. Free text needs a
   row or an explicit exemption; it has neither.
4. **`purchase_orders.eta_date` is the only anchor either call can read, and §2's signal table
   does not name it.** §2 names `expected_ready_date` for the supplier's ready date and lists no
   column for *"when the goods are expected"*. A PO with no `eta_date` raises no tomorrow call
   at all — no fallback to a lead time, because P1 deleted exactly that habit. Worth a line in
   §2 either way.
5. **A balance answer does not move `purchase_orders.eta_date`**, on purpose: that date is about
   the whole PO and the promise is about one line. So a PO whose only outstanding line has a
   balance date still shows the old PO-level arrival on the Receiving tab's ETA column. Correct
   per line, confusing at a glance; the fix is a per-line date column and that is not P3's.

## P4 · Where the goods go

**Goal:** a PO says where the supplier must send the goods, and prints it.

**Build:**
1. Destinations: `Carres Klang` (our own warehouse) · `AL Sungai Buloh` · `HOUZS Balakong`.
   **AL and HOUZS are DELIVERY ADDRESSES, not warehouses** (Loo 2026-07-28) — do NOT create
   `warehouses` rows for them. Carres has exactly one warehouse and a second warehouse entity
   would put goods we do not count into every stock rollup.
2. The choice sits on the PO and appears on the printed PO.
3. **Nice Future is fixed** — it does not deliver: `collected by NETS → Carres Klang` is its
   only option, and the PO says so.
4. Default for everyone else is `Carres Klang`.
5. **The supplier-facing PDF prints no RM value of any kind** (Loo 2026-07-28): PO number ·
   supplier · items · quantity · delivery address · delivery instructions · dates. The
   purchase price stays internal. Check `PoDocumentPreview.tsx` against this before adding
   the address — the rule is about the whole document, not only the new field.

**Why it matters:** an outstation order can only be delivered by AL, and AL will not collect
in Klang. Sending the goods straight to AL saves a whole transfer.

**NOT in this card:** moving goods we already own (the Lalamove run that takes pillows and
mattress protectors from Klang to AL). That is a **stock transfer** and belongs to the Stock
line — putting it here would mix "buying" and "moving" in one place and neither would
reconcile.

### ⭐ SCOPE, RULED BY LOO 2026-07-29 — read this before the numbered list above

The pre-flight found that the card as written could not be built without deciding three
things it does not decide. Loo ruled all three, and **one of them makes this card bigger than
its own Build list**:

**Q1 → A · the destination is its own field, and it is NOT a warehouse foreign key.** The two
have different meanings and both are kept: `purchase_orders.warehouse_id` = *where Carres
inventory is recorded* · the new destination = *where the supplier physically sends the goods*.
**AL and HOUZS are still never `warehouses` rows.** (This is the same split C9 made between
`holds` and `owing`: two columns answering two different questions is not a second model.)

**Q2 → B · TRUTHFUL RECEIVING IS PART OF P4, NOT P5.** Loo, in his own words: *"Do not
knowingly post goods delivered to AL or HOUZS into Carres Klang inventory … Do not defer a
known-wrong inventory posting to P5. P5 will validate the completed behaviour using a real PO.
It must not be the card that first fixes a known architecture error."*

For an AL or HOUZS destination, receiving **may** update the PO line received quantity and the
receipt evidence, and **must not** create a Klang `stock_balances` row, a Klang
`stock_movements` row or a Klang `ops_stock_items` unit.

**Measured 2026-07-29, and this is why the card grew: the wrong posting has more than one
door.**

| Door | What it does today | What P4 owes it |
|---|---|---|
| `_operation_create_po_inner` | mints one `incoming` unit per piece at `warehouse_id` **at PO-open** | an AL-bound PO must mint none — the register would otherwise lie from the moment the PO exists, before anyone receives anything |
| `operation_receive_po_with_do` | posts balances + movements + units, then advances the customer thread and **reserves** Klang stock | skip the three postings; the thread still advances, without a reserve there is no stock to make |
| `operation_receive_po_line` · `po_receive` | **0 live call sites**, but both are `execute`-granted and both write `stock_balances` | a gated front door with an open side door is worse than no gate (standing law) — they are either gated or revoked, and that is a question for Loo |

**Q3 → A · the Nice Future collection rule lives in the existing manager-only Purchasing
supplier settings, with audit history.** Not a hard-coded slug (P1 spent a card deleting that
habit) and not a new `suppliers` boolean unless the settings model cannot represent it — it
can.

**The external document ruling is wider than this card's item 5, and item 5 also names the
wrong file.** `PoDocumentPreview.tsx` already carries no RM (Jess removed it 2026-07-24). The
document that breaks the rule is **`apps/web/src/lib/pdf/po-template.tsx`**, which prints
`Unit Price`, `Line Total`, `Total` and `+RM {surcharge}` — and it is rendered for the pickup
partner too (`AssignPickupDialog.tsx`), not only for the factory. **Loo, 2026-07-29: remove
every purchase price and RM amount from every PDF the external PO template generates —
suppliers, NETS or another pickup partner, any party outside the portal — and do NOT split the
template to keep prices for one external recipient.** So `PoTemplateData`'s `unit_price` /
`line_total` / `grand_total` and the api payload that fills them come out with it.

**The words are locked** (COPY-STANDARD, Loo 2026-07-29): the field label is
`Where the goods go`; the three options are `Carres Klang` · `AL Sungai Buloh` · `HOUZS`; the
Nice Future line is `NETS collects from Nice Future and delivers to Carres Klang.`; the
optional field is `Delivery instructions`. **The PO and the external document print the actual
SAVED destination name**, never `Ship-to` · `Destination` · `Drop point`.

**Reported, not resolved, and it belongs to a PLAN chat:** `docs/PURCHASING-WORKING-FLOW.md`
§3's *"Where the goods go"* table and §9 do not yet say what receiving does when the goods
never reach a Carres warehouse. Q2's ruling is the flow's rule, and the flow file is where it
has to live — a BUILD chat implements standards, it does not write them.

**Migration:** yes — the destination list, the PO's destination, the supplier collection rule,
and the two stock-posting RPCs. Draft to Loo first.
**Done when:** a printed PO tells the supplier exactly where to send the goods, Nice Future's
PO can only say one thing, **no Klang stock record is created for goods delivered to AL or
HOUZS**, and no external PO document carries an RM figure.

### 🔴 AUTHORITATIVE HANDOFF — read this before touching P4 (written 2026-07-29)

**This section is the design, ruled by Loo and already paid for in measurement. A chat that
re-derives it has spent a session re-discovering what is written here; a chat that changes it
has overturned a ruling. Everything below is decided.**

#### 1 · Migration status

- **✅ CLOSED. `0307_where_the_goods_go` is APPLIED, VERIFIED and MERGED (2026-07-29).** The
  tracker tail is `0307_where_the_goods_go` and `main` carries the file — see §8 for the
  receipt.
- **The migration line of P4 is finished. Nobody re-opens it.** A later correction is a NEW
  migration, never an edit to 0307 (guardrail: never alter committed migration history).
- **What this section used to say, kept because the sequence is the lesson:** the chat that
  built 0307 ran a deliberately failing negative-control harness AND a complete rolled-back dry
  run, and reported both **before** asking to apply; it re-read `list_migrations` immediately
  before numbering and again immediately before applying (guardrail #8). That order is what a
  future P-card copies.

#### 2 · Destination freeze rule (Loo)

- Once ANY line on the PO has `received_qty > 0`, **`destination_id` is frozen**.
- Any later destination change is **rejected**.
- **No partial preservation and no automatic stock reconciliation.** The reason is not
  laziness: a PO whose destination says `AL Sungai Buloh` while half its units are already
  booked into Klang is a state the register cannot express, so the honest move is to refuse
  the change rather than invent a mixed truth.
- **Enforced in the DATABASE**, not only in the UI — a trigger, so it holds against every door
  including PostgREST.

#### 3 · `trg_po_units_follow_destination`

- `purchase_orders.destination_id` is **NOT NULL**, and its **database default is the single
  active default destination** (initially `Carres Klang`). This is the card's own item 4, not
  a fallback of the kind P1 deleted.
- **Existing PO-creation functions need NO new parameters.** The API updates `destination_id`
  after creation, following the **existing `eta_date` pattern**
  (`apps/api/src/routes/operation/pos.ts` — Loo, 2026-05-10: *"adding a 6th param would need a
  DROP+CREATE migration. Cheaper: post-RPC UPDATE"*).
- The trigger runs **after PO insert and after a destination change**.
- A destination **linked to a warehouse** ensures the correct `incoming` units exist.
- A destination with **`warehouse_id = NULL` leaves NO incoming inventory units.**
- **Idempotent** — safe on repeated updates.
- **It must NEVER delete received, completed or historically used inventory records.** It only
  ever reconciles units still in `incoming`; §2's freeze means a destination cannot change once
  receiving has begun, so the dangerous case is blocked upstream rather than handled here.

**Why a trigger and not parameters** (measured, not preferred): threading `destination_id`
through the create doors would mean DROP+CREATE on **five** live functions
(`_operation_create_po_inner` · `operation_create_po` · `operation_create_pos_batch` ·
`operation_issue_pos_for_order` · `operation_receive_po_with_do`, ≈35,000 characters of live
inventory code), and it would still leave phantom units on the real path *create as Klang →
change to AL*. The trigger makes the register correct **whichever door created the PO and in
whatever order the fields were set** — 0305/0306's rule that a stamp one route writes is a
stamp the other doors walk around.

#### 4 · `operation_receive_po_with_do` — the FOUR anchored edits

Extract with `pg_get_functiondef()`. **Do not reconstruct it from memory.** It is 16,163
characters live; the change is four narrow anchors:

| # | Anchor (live text) | Edit |
|---|---|---|
| 1 | the declaration `v_is_own boolean := false;` | add `v_posts_stock boolean := false;` after it |
| 2 | `select (kind = 'own') into v_is_own from warehouses where id = v_po.warehouse_id;` | after it, resolve `v_posts_stock` from `purchase_orders.destination_id` → `purchasing_destinations.warehouse_id` — true only when that warehouse is non-null AND equals `v_po.warehouse_id` |
| 3 | `if v_delta > 0 then` | → **`if v_delta > 0 and v_posts_stock then`** — this ONE anchor covers `stock_balances`, `stock_movements`, the `incoming → free` flip and the replacement mint, because all four already share that outer condition |
| 4 | the `for v_reserve … loop` that runs `update stock_balances set reserved = reserved + …` | wrap it in `if v_posts_stock then` — the thread still advances; there is simply no Klang stock to reserve |

**Explicitly unchanged, and this is the point of the card:**

- `received_qty` — unchanged
- receipt evidence (`do_file_path` · `do_number` · photos) — unchanged
- claims (damaged / wrong item, and their evidence gates) — unchanged
- `po_history` — unchanged
- thread progression — unchanged
- **a non-warehouse destination creates NO balances, NO movements, NO stock items and NO
  reservations**

#### 5 · `purchasing_po_document(p_po_id)`

- It is the **only** database source for external PO documents.
- It enforces the **internal role gate**.
- An external destination with **no complete address raises `destination_address_missing`**.
- Its payload contains **no unit price, no line total, no grand total, no surcharge amount, no
  RM field and no other purchase-price data** — the money is not removed from a template, it
  is *absent from the payload*, so no client can print what it never receives.
- **`/api/operation/pos/:id/print-data` must read from it** instead of assembling the document
  from tables.
- **Every external consumer of `renderPoPdf` uses this same payload** — supplier documents and
  pickup-partner documents alike (`AssignPickupDialog.tsx` is one of them; the card's original
  item 5 named `PoDocumentPreview.tsx`, which already carries no RM. **The document that breaks
  the rule is `apps/web/src/lib/pdf/po-template.tsx`**, which prints `Unit Price`, `Line Total`,
  `Total` and `+RM {surcharge}`).
- **No second direct-table external export path is allowed.**
- Internal portal screens keep reading internal price data through their existing authorised
  paths. This ruling is about EXTERNAL documents only.
- **The boundary did not exist before P4 and this is why it is being created**: `po_sup_status`
  has no `sent` or `issued` value (a PO is born `pending`; the next state, `acknowledged`, is
  the *supplier's* action), and the export was assembled in TypeScript straight from tables —
  so the database could not see an export happen at all.

#### 6 · Revokes

- **Revoke `EXECUTE` from `anon` AND `authenticated`** on `operation_receive_po_line` and
  `po_receive`. Both directions matter: `revoke … from public` alone does not drop `anon` on
  Supabase.
- **Keep the owner (`postgres`) and the administrative access already in place.**
  **Do not delete the functions and do not redesign them** (Loo).
- **Dependency checks were ALL ZERO before approval** (verified 2026-07-29): 0 web call sites ·
  0 api call sites (the single mention is a comment at
  `apps/api/src/routes/operation/pos.ts:949` saying the RPC *"is still in the DB but unused"*) ·
  0 calls from other functions · 0 trigger calls · 0 hard dependents (view / rule / default /
  constraint) · **`pg_cron` is not installed**, so there are no database scheduled jobs at all,
  and the only scheduler is the Worker's 09:00-MYT cron, which calls neither.

#### 7 · Locked wording — already in COPY-STANDARD, do not reinvent

`Where the goods go` · `Carres Klang` · `AL Sungai Buloh` · `HOUZS` ·
`NETS collects from Nice Future and delivers to Carres Klang.` · `Delivery instructions` ·
`Address not set`

`Address not set` appears in **manager Settings only** and must never reach a PO, the external
document, or an error a store reads. `HOUZS` is deliberately shorter than "HOUZS Balakong" —
do not "complete" it. The PO and the external document print the **saved destination name**,
never `Ship-to` · `Destination` · `Drop point`.

#### 8 · APPLIED AND VERIFIED — production 2026-07-29, migration line CLOSED

**`0307_where_the_goods_go` is APPLIED to production, verified, and merged to `main`.** The
migration tracker tail is `0307_where_the_goods_go` and the repository matches it. Production
is healthy and no production data moved.

**The order was: dry run → PM approval → commit the file → apply → verify → merge**, and it is
the order that keeps prod from serving a page whose table does not exist. The file was
committed BEFORE the apply so the exact reviewed bytes are what reached production, and the
migration-only PR (**#513**, squash `91d7bf8d`) carried that one file and nothing else —
application code is deliberately not part of P4.

**One thing worth not re-learning about the apply.** The migration was committed alongside a
docs edit, and a migration-only PR cannot carry two files, so the migration was split onto its
own branch off `main`. **The split was proved by BLOB IDENTITY, not by re-copying**: the blob
is `7b6e5867…` in the original commit, on the split branch and on `main`, and its LF content
hashes to `d5f1cb55…` — the exact bytes applied. A local `md5sum` of the checked-out file
disagrees, and that is Windows `core.autocrlf` writing CRLF, not a difference in the file. A
chat that compares working-copy hashes on Windows will chase a ghost.

**Built from live definitions with `pg_get_functiondef()`** — nothing reconstructed from
memory. All four anchors of §4 were verified to occur **exactly once** in the live source
before editing, and `v_posts_stock` did not previously exist.

**The negative-control harness fired as intended** (a deliberately wrong assertion placed
after every real one), so the harness is proved capable of failing. It also caught a real
defect in its own first draft: an assertion tried to "change" the destination to the value it
already held, and the guard correctly treats a no-op as a no-op.

**The complete rolled-back dry run passed with 34 assertions green.** The load-bearing ones:

- **The byte proof.** Applying the four edits in REVERSE to the new `prosrc` yields the live
  `prosrc` exactly — the only differences from live are the four intended anchors.
- **The point of the card.** Receiving an AL-bound PO leaves `stock_balances` unmoved, writes
  **0** `stock_movements` and **0** `ops_stock_items`, while `received_qty`, `do_number`,
  `do_file_path` and `po_history` are all recorded.
- **Nothing else moved.** A Klang-bound receipt still posts balance +2, one movement and two
  `incoming → free`.
- A non-`incoming` unit survives a destination flip · a supplier and a partner are each
  refused 42501 · the destination freezes once `received_qty > 0` while a non-destination
  update still works · export is refused with `destination_address_missing` · the payload key
  set is exact and `fabric_surcharge` is stripped while `fabric_name` survives.

**Rollback verified total BEFORE the apply:** table absent · both `purchase_orders` columns
absent · both `purchasing_supplier_settings` columns absent · 0 P4 functions · 0 P4 triggers ·
`operation_receive_po_with_do` back to md5 `a5c31f93babd7a20f3c5c74e313d4256` at 16,163 chars
· `anon`/`authenticated` EXECUTE restored on both revoked functions · 0 POs · 0 lines · 87
units · 0 incoming · 40 balances · 0 movements · 0 `po_history` · 0 setting changes · **0 rows
written to `audit_log` that day.**

**The one failure mode a dry run could NOT catch, and how it was closed.** The dry run proves
the payload it was HANDED is correct; it cannot prove the committed FILE holds those same
bytes, and a file that differs by one character would apply cleanly and be silently wrong. So
before applying, the expected new source was computed in SQL from the live pre-apply source
(the four forward replacements) and hashed — `5ff0f5692406c73fe8a15b7300c10548`, 16,719
chars — and the committed file's own function body was hashed locally to exactly that. Only
then was the file applied.

**All 13 production verification checks PASSED after the apply:**

| # | Check | Result |
|---|---|---|
| 1 | tracker tail · `0307%` rows | `0307_where_the_goods_go` · 1 |
| 2 | destinations seeded | 3 — `Carres Klang \| AL Sungai Buloh \| HOUZS` |
| 3 | one default linked · externals unlinked and address-less | 1 · 2 |
| 4 | RLS on · 1 policy · **0 write policies** | true · 1 · 0 |
| 5 | 2 CHECKs · one-default index | 2 · 1 |
| 6 | `destination_id` NOT NULL + default fn · `delivery_instructions` nullable | `NO / purchasing_default_destination()` · `YES` |
| 7 | both triggers · units trigger deferred | 2 · `true/true` |
| 8 | 6 new signatures · 1 receive signature (no ghost overload) | 6 · 1 |
| 9 | byte reconcile of the replaced function | `5ff0f569…` · 16,719 |
| 10 | `public`/`anon`/`authenticated` lose EXECUTE on both · owner + `service_role` keep · both still exist | false ×6 · true · true · 2 |
| 11 | no collateral damage · `anon` cannot export | true · false |
| 12 | Nice Future rule stored, and ONLY Nice Future | 1 · `Nice Future -> Carres Klang collected by NETS` |
| 13 | untouched data | 0 POs · 0 lines · 87 units · 0 incoming · 40 balances · 0 movements · 0 `po_history` · 0 claims · 0 promises · **55 control rows** · 0 setting changes |

**All SEVEN functions reconcile byte-for-byte, file vs production** (guardrail #3, applied to
every function rather than the one that was replaced): `operation_receive_po_with_do` 16719
`5ff0f569…` · `purchasing_default_destination` 91 `f526941f…` · `purchasing_po_document` 2819
`d6316c92…` · `purchasing_set_destination_address` 909 `faefa34c…` ·
`purchasing_set_supplier_collection` 1729 `789bf0fb…` · `trg_po_destination_guard` 744
`515d8e76…` · `trg_po_units_follow_destination` 2291 `f6ff11ff…`

**Live effect today: NONE** — 0 purchase orders exist, so nothing can yet reach a destination,
a freeze, a unit reconcile or an export. P4 decides the behaviour before the first PO exists,
exactly as C7, C8, C9 and P3 did.

**THREE DECISIONS BEYOND THE HANDOFF, ALL ACCEPTED BY THE PM 2026-07-29:**

1. **The units trigger is `DEFERRABLE INITIALLY DEFERRED`, not immediate.** §3 says it runs
   "after PO insert"; measured, `_operation_create_po_inner` inserts the PO row FIRST and mints
   units later inside its per-line loop, after each line insert — so an immediate trigger on
   either table fires before the units exist and does nothing. Deferring is what makes §3's own
   *"in whatever order the fields were set"* literally true.
2. **The guard gates WHO may change the destination, not only WHEN.** `po_scoped_update` lets
   the SUPPLIER and the PARTNER update their own `purchase_orders` rows over PostgREST, and
   `enforce_partner_po_column_whitelist` is really a BLACKLIST — a new column is permitted by
   default. Without the role gate a supplier could redirect its own goods and the document
   would print the new address. This is §6's own *"a gated front door with an open side door"*
   applied to a door §2 did not enumerate.
3. **`attrs` is ALLOWLISTED (`color · gap · fabric_name`).** Money leaks through `attrs`, not
   only through the named fields: `fabric_surcharge` rides in `purchase_order_lines.attrs` and
   `po-template.tsx` prints it as `Walnut (+RM 250)`, so removing `unit_price` / `line_total` /
   `grand_total` alone would NOT have removed the money.

**Reported only — these stay open and nothing was changed for them:** concurrency (the freeze
reads `sum(received_qty)` without locking lines) · the RLS layer (gate assertions ran as
`postgres` with a JWT claim, proving the `app_role()` path rather than PostgREST's
`authenticated` + RLS) · `service_role` keeps EXECUTE on both revoked functions, per Loo's
"keep the administrative access already in place" · and the remaining edge cases in §9.

#### 9 · Planning Clarifications

**Planning clarification required — the flow file, not the code:**

- §3's *"trigger runs after PO insert"* cannot be implemented as an immediate trigger, for the
  measured reason in §8 decision 1. The wording describes an ordering the create path does not
  have.
- §2's freeze alone does not close the supplier/partner write door (§8 decision 2). The freeze
  is about WHEN; the door needed a rule about WHO.
- `PURCHASING-WORKING-FLOW.md` §3's *"Where the goods go"* table and §9 still do not say what
  receiving does when the goods never reach a Carres warehouse. Q2's ruling is the flow's rule
  and the flow file is where it has to live — a BUILD chat implements standards, it does not
  write them.

**Planning clarification required — data, not code:** `Carres Klang`'s warehouse address reads
`NETS-managed facility (Klang)`, which is a description rather than a postal address. It is
non-empty so it passes the export gate, and the supplier document would print it.

**Recorded for whoever wires the api half:** `renderPoPdf` has **four** external consumers, not
two — `AssignPickupDialog.tsx` · `PoDetailModal.tsx` · `OrderDetailDrawer.tsx` (plus a test).
All four go through `/print-data`, so re-pointing that one route covers every one of them.

**Q3 stores FACTS, not the sentence.** `NETS collects from Nice Future and delivers to Carres
Klang.` is composed from `collected_by_partner_id` + the supplier + `fixed_destination_id`.
Storing the sentence would give a locked word a second home.

**Edge cases NOT covered by the dry run, reported only:**

1. **Over-mint after a partial flip** — a PO holding a non-`incoming` unit whose destination
   flips back to a warehouse mints to full line quantity and ignores it. Unreachable today: a
   free unit only exists after receiving, and §2's freeze blocks the change.
2. **`purchasing_set_supplier_collection` was never called** — its gate and audit path are
   untested.
3. **`HOUZS` was never used on a PO** (only AL); symmetric code path, untested.
4. **Partner warehouse (`kind <> 'own'`) and a second own warehouse** — neither exists, so
   `v_is_own = false` and the warehouse-mismatch branch are untested live.
5. **Cancelled-PO export refusal** (`po_not_printable`) untested; **`delivery_instructions`**
   never populated or printed.

#### 10 · P4 IS FROZEN — and the application code is NOT part of it

**Ruled by the PM, 2026-07-29.** P4 delivered the DATABASE half: the destination model, the
guard, the unit reconcile, the four anchored edits, the document RPC, the revokes. It is
applied, verified, merged and **closed**. No chat re-opens P4 to "finish" it.

**The application-code half is a NEW execution card in a NEW chat**, under the governance
rule `CLAIM → PUSH → VERIFY CLAIM → IMPLEMENTATION`. Do not reuse the migration chat.

**What that card owes** — recorded here only so nobody re-derives it, not as a licence to
build it from this file:

- `/api/operation/pos/:id/print-data` reads `purchasing_po_document` instead of assembling the
  document from tables. **No second direct-table external export path is allowed** (§5).
- `unit_price` · `line_total` · `grand_total` · `currency` come out of `PoTemplateData` and
  `apps/web/src/lib/pdf/po-template.tsx`, including the `+RM {surcharge}` the template builds
  from `attrs`. The money is absent from the payload already; the template must stop asking.
- **`renderPoPdf` has FOUR external consumers, not two** — `AssignPickupDialog.tsx` ·
  `PoDetailModal.tsx` · `OrderDetailDrawer.tsx` (plus a test). All four go through
  `/print-data`, so re-pointing that one route covers every one of them.
- The `Where the goods go` field on the PO form, and the manager Settings rows, using ONLY the
  locked wording in §7. `Address not set` is a Settings word and may not leak onto a PO, onto
  the external document, or into an error a store reads.

**Its first act is a rebase.** The D2 typography codemod has already rewritten every
Purchasing page that card will touch; a branch cut before it will conflict on files this card
has no business changing.

## P5 · Prove it with a real PO

**Goal:** the whole line has never run. Take one real customer order from To Order through
Send PO → ready date → tomorrow's call → check in (part) → balance call → fully received,
and fix whatever breaks.

**This is a card, not a test plan.** Zero POs exist, so every earlier card is theory until
one goes end to end.

**Build / fix as found:**
1. The two gates that have no home yet: a PO cannot be sent twice for the same customer line
   and quantity; a check-in cannot be posted twice for the same supplier delivery order
   number.
2. Whoever is on an action shows on it (`Yu Jun is handling this · started 10:14`) — everybody
   can see everybody's work, so two people WILL open the same action. **Store it as a
   lightweight claim** — `(action identity) → claimed by → claimed at` — expiring on
   `ACTION_CLAIM_TIMEOUT_MS` (already exported from `packages/shared/order-actions.ts`;
   **import it, never retype the number**), and read it ONLY through the open-action list so a
   finished or recomputed-away action cannot carry one (flow §5). **`ops_tasks` already has `claimed_by`/`claimed_at` and is still the
   wrong home**: minting a task row per engine action turns the ladder back into a manual
   to-do list, which is the one thing ACTION-FLOW-STANDARD forbids. Reuse the shape, not the
   table.
3. One PO document really does carry several customers' lines (§1), and one customer order
   really does need several POs. Prove both on the real run, not on a fixture.

**`cancelled_qty` is NOT in this card any more** (Loo 2026-07-28): purchasing does not model a
cancellation at all. A customer cancellation needs management approval and belongs to the
Orders cancellation policy; purchasing keeps processing a valid PO until Operations says stop,
and stopping is the whole PO (`purchase_orders.status = 'cancelled'`, already built).

4. **`Confirm ready date` has no button that can close it** — found by P3, 2026-07-29, and it
   is the shape C3 retired one lane over. The action is live on the To Order tab's ② stage,
   but **no route in the portal writes `purchase_orders.expected_ready_date`**: the only
   supplier-facing write is `POST /api/operation/pos/:id/chase-event`
   ([queries.ts](../apps/web/src/lib/queries.ts) → `useChasePoEventMutation`), which inserts
   one `audit_log` sentence and touches no date. So the completion §3 states — "the latest
   ready date **and** the outcome are recorded" — is unreachable, and the row can only leave
   by the supplier's own portal moving the date. **P3 did not build it**: it is the EXISTING
   action, not one of the two missing calls, and 0306's ledger is the right home for its
   promise history when it is built (`kind` takes a third value and the RPC is a copy of
   `purchasing_record_tomorrow_delivery`). Prove it on the real run and fix it here.

**Migration:** likely. Draft to Jess first.
**Done when:** one real PO has gone the whole way, including a short delivery, and every
number on screen matches what actually happened.

## P6 · To Order becomes the Planning Workspace

**Goal:** make the frozen purchasing information architecture true on the To Order tab.

**READ FIRST, BOTH, IN FULL:**
[`docs/PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md) (frozen 2026-07-29 —
the seven regions, the legal overlap, the seven model rules, the boundary) and
[`docs/PURCHASING-WORKING-FLOW.md`](PURCHASING-WORKING-FLOW.md) §1 · §7 · §9.

**⛔ EIGHT TERMINOLOGY SLOTS ARE OPEN AND THIS CARD MAY NOT FILL ANY OF THEM.** SLOT-1 to
SLOT-8, listed in the information model §10 and mirrored in `docs/COPY-STANDARD.md`. **A chat
that writes a temporary word has invented terminology** and has broken rule 8. Everything
below whose word is unruled is **blocked on Jess** — build what can be built without it, and
report the rest.

**ALREADY EXISTS — do not rebuild:** the plan engine · the order-by computation · the urgency
buckets · the working-day calendar · the settings store (P1/0303) · the facet rail and the
§8.2 click behaviour on this tab (P2/#492) · the freshness stamp (`TodayRefresh`) · the
`Set a number` output for a supplier × category with no production days.

### The measured gaps this card carries

Every one was measured on 2026-07-29. **They are facts, not estimates.**

| # | Gap | Where |
|---|---|---|
| **G1** | **Demand whose supplier cannot be resolved is silently discarded.** The planning read drops any line whose item resolves to no supplier and produces no output anywhere. **Silent discard is not permitted** — it must appear under Missing configuration stating the customer order, the item, the category, the quantity and why resolution failed | `apps/api/src/routes/operation/purchase.ts` |
| **G2** | **Supplier resolution runs by TWO different rules in one module.** Planning resolves by the item's own supplier alone; PO creation additionally falls back to which categories a supplier covers. A requirement invisible to one and buyable in the other is one requirement with two truths. **One rule, shared** | `purchase.ts` + `CreatePOModal.tsx` |
| **G3** | **Intentionally held demand produces no output at all.** Deliberately excluded, time-boxed and snoozed demand is dropped with nothing on screen. It must state **what · who · why · until when**, and it may **never share a status or an empty state** with Missing configuration | `purchase.ts` |
| **G4** | **There is no Draft PO anywhere in the system** — no store, no route, no schema, no screen. `DraftLine` in `CreatePOModal.tsx` is a form-row type, not a persisted object; do not mistake it for one | whole stack |
| **G5** | **`Check in` must leave To Order, and no information may leave with it.** To Order's receiving stage states the **customer name / SO number** per entry; the Receiving tab does not carry that fact. **The To Order implementation is not removed until Receiving carries: PO · supplier · customer name · SO number · warehouse · ETA · quantity still to receive** | `OperationPurchase.tsx` → `OperationReceiving.tsx` |
| **G6** | **`Confirm ready date` cannot be closed.** No route in the portal writes `purchase_orders.expected_ready_date`; the only supplier-facing write inserts one audit sentence and touches no date. The queue can only grow. **This is P5's finding and P5 still owns the fix** — P6 must not ship a To Order whose second queue is permanently red without saying so on screen | `apps/api` |
| **G7** | **A draft's risk date is computed at read time, never stamped** (model §6.4), and **a draft whose covered demand has disappeared must be able to say so** (§6.5). Both are model rules, not optional polish | new work |

### Order of operations

1. **The shape decision comes first and is written down before any code**: UI-KIT §8.2's
   stage-vs-queue test applied to the NEW composition of To Order. **The test is the empty
   state, never the look.** §8.2 currently describes the OLD three cells and says so.
2. **G5 before the removal.** Receiving gains the facts first; only then does `Check in`
   leave To Order. Doing it in the other order deletes information.
3. Everything blocked on a word waits for Jess. Report it; do not name it.

**Migration:** likely — a Draft PO is a stored business object and it is **not** a row of
`purchase_orders` (it has no PO number and produces no external document, and that absence is
what makes "a Draft is not a PO" structural). **Draft to Jess first (guardrail #8); number
from the TRACKER at apply time, never from `ls`. Apply and verify BEFORE merging.**

**P4 is FROZEN and this card may unfreeze it only where the new architecture requires it**
(Loo, 2026-07-29) — no unrelated refactoring of 0307's objects.

**Done when:** no real procurable demand can leave the purchasing workload silently, held
demand states who held it and until when, a Draft PO exists as its own business object inside
To Order, and `Check in` has left To Order without a single fact being lost.

## Reported, not built (recorded so nobody rediscovers them late)

- **PO revisions — RULED OUT, not deferred** (Loo 2026-07-28). A sent PO is never edited: more
  items means a NEW PO, and stopping one means cancelling the whole PO. There is no version of
  a sent document to keep, so the gap this line used to describe does not exist.
- **The finer quantities** (`in_transit_qty`, `ready_for_collection_qty`,
  `supplier_confirmed_qty`). Not built: a column nobody writes is worse than a missing one —
  that is exactly how `ops_order_control.balance` became a lock reading a NULL for months.
- **The September switch.** Nice Future stops supplying in September; a new mattress supplier
  takes over on the subscription model. Sofa and bed frame unchanged. Its own line when it
  comes.

## Status

| Card | Status | PR |
|---|---|---|
| P1 | ✅ the numbers become settings (migration **0303**) | #488 |
| P2 | ✅ the interaction law is true on **To Order** (#492) · **Claims** (#494) · **Receiving** (#495). Purchase Orders is a nested route with no rail and was never in scope | #492 · #494 · #495 |
| P3 | ✅ the two missing supplier calls (migration **0306**) — and a balance date enters Delay planning too (Loo, 2026-07-29) | #506 |
| P4 | ✅ where the goods go — migration **0307 applied, verified and merged** 2026-07-29 · **P4 FROZEN**; the application-code half is NOT P4 and starts as its own execution card (§10) | #513 |
| P5 | ⬜ after P1-P4 · prove it with a real PO | — |
| P6 | ⬜ **To Order becomes the Planning Workspace** — the frozen information architecture ([`docs/PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md), 2026-07-29) made true on the tab. Carries seven measured gaps (G1-G7) incl. two positives: demand silently discarded, and `Check in` moving out without losing the customer fact. **Eight terminology slots OPEN — no chat may fill one** | — |
