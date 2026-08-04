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

## P6 · Purchasing terminology freeze

> **⚠️ HISTORICAL RECORD — PARTLY SUPERSEDED 2026-07-30 by the Purchasing clean restart
> (Loo). This whole card, instructions and shipped record alike, is kept as the account of
> what was ruled on 2026-07-29 and is NOT a live word list.** `Draft PO` is permanently
> removed, and with it slots 1 · 3 · 5 · 6 (`Prepare PO`, the `Draft PO` noun,
> `Demand no longer required`, `Covered by {count} Draft POs`). Raising a purchase order is ONE
> act, `Issue PO`. The Operation Status list is FIVE labels, not six — `Draft` is gone.
> **`docs/COPY-STANDARD.md` is the canonical home and is already corrected.**

**Goal:** rule **SLOT-1 through SLOT-8 in ONE session** and write every ruled word into
`docs/COPY-STANDARD.md`, so the Purchasing dictionary is whole again.

**⛔ THIS CARD IS A PLAN CHAT, NOT A BUILD CHAT.** It writes documentation and nothing else —
no schema, no migration, no API, no React, no deploy. Its output is words.

**⛔ IT MUST BE ONE SESSION.** Ruling four slots and stopping is worse than ruling none: the
half-renamed state puts one act on two screens under two words, which is the exact defect the
shared word module exists to prevent, and it is what `Send PO` is suffering from right now.

### Read first, all three

| File | For |
|---|---|
| `docs/COPY-STANDARD.md` | **the canonical slot definitions** — what each of the eight needs. The words are that file's |
| `docs/PURCHASING-INFORMATION-MODEL.md` §10 | **where each slot is USED**, so a ruling can be checked against the thing it unblocks |
| `docs/PURCHASING-WORKING-FLOW.md` §1 · §3 · §7 · §9 | the actions the words name, and their trigger / due / completion |

### The one slot that is NOT a Purchasing-only decision — put it to Jess FIRST

**SLOT-2 reaches into Orders.** `docs/COPY-STANDARD.md` declares `Send PO` **one action shared
by Orders and Purchasing**, spelt identically in both. The frozen lifecycle splits the
Purchasing side into `Prepare PO` → `Issue PO`.
So there are only two honest outcomes and both are Jess's:

- the action stays shared and **the Orders wording moves too**, or
- it stops being one shared action and **each flow gets its own entry**, and the sentence
  claiming they are one is deleted.

**Anything else leaves one act with two spellings.** Settle this before the other seven — it
decides whether SLOT-1 is a new word or a re-scoping of an existing one.

### What the card must produce

1. **Eight rulings.** Five strings each (queue tile · row line · button · done message ·
   empty state) for the action slots; one fact string each for the fact slots; a name plus
   its facts for SLOT-7; a home for SLOT-4.
2. **Every ruled word written into `docs/COPY-STANDARD.md`** — its canonical home.
3. **Every terminology placeholder replaced in the same session**, across:
   `docs/ACTION-FLOW-STANDARD.md` (Law 4 rung 3) · `docs/PURCHASING-WORKING-FLOW.md`
   (§1 · §3's `Send PO` warning block · §7) · `docs/PURCHASING-INFORMATION-MODEL.md`
   (§4 · §9's ASCII · §10) · `docs/purchasing-execution-queue.md` (this file, P7).
4. **`docs/PURCHASING-WORKING-FLOW.md` §3's six things for the two halves.** The `Send PO`
   entry currently carries a warning saying its six things describe the OLD single step and
   stay until this card runs. **This is the card. Rewrite them** — trigger, checklist,
   completion, due, task owner, counted per, re-checked when — for `Prepare PO` and for
   `Issue PO` separately. `Issue PO`'s completion is *a PO exists for the line*; the old
   entry's is already that sentence, so it moves rather than being invented.

### Rules this card may not break

- **No temporary wording.** A word Jess has not ruled does not go on a screen or into a
  document. If a slot cannot be settled, the card reports it and **the other seven still ship
  in that session** — but a reported slot keeps its placeholder rather than
  receiving a stand-in.
- **The approved business meaning does not change.** This card names things; it does not
  re-decide the lifecycle, the ordering, the boundary or the regions.
- **`Issue PO`, `Draft PO`, `Issued`, and the six Operation Status values are already ruled**
  (Loo, 2026-07-29) and are not reopened. SLOT-3 and SLOT-4 are about the SCREEN noun and the
  vocabulary HOME, not about those decisions.
- **Ownership holds**: the words go to `COPY-STANDARD`, the workflow effects to
  `PURCHASING-WORKING-FLOW`, the region effects to `PURCHASING-INFORMATION-MODEL`. One
  canonical home each, pointers elsewhere.

**No migration. No code.**

**Done when — and this is measurable, so measure it:**

```
grep -rho "<SLOT-[0-9]>" docs/ | wc -l        ->  0        # ✅ 0 as of 2026-07-29
```

**Baseline 2026-07-29: 20 placeholders across 5 files** — `PURCHASING-INFORMATION-MODEL.md`
(incl. the ASCII layout) · `PURCHASING-WORKING-FLOW.md` · `COPY-STANDARD.md` ·
`ACTION-FLOW-STANDARD.md` · this file. The angle-bracket form was the placeholder; a bare
slot number in this card's own history is prose about the card and does not count.

Plus: `docs/COPY-STANDARD.md` carries five strings for every Purchasing action, and
`PURCHASING-WORKING-FLOW.md` §3 describes the two halves of raising a PO as two actions with
six things each.

### ✅ SHIPPED — what actually landed (2026-07-29)

**All eight slots ruled by Loo in one session. Documentation only — no schema, no migration,
no API, no React.** `docs/COPY-STANDARD.md` is the canonical home for every word below and
the four other documents reference it.

| # | Ruled |
|---|---|
| 1 | **`Prepare PO`** · queue `Prepare PO for {supplier}` · button `Prepare PO` · done `Draft PO prepared for {supplier}` · empty `No purchase orders need preparation.` |
| 2 | **`Send PO` retired from Purchasing**, and the statement that Orders and Purchasing must carry one identical `Send PO` entry is **deleted** |
| 3 | **`Draft PO`** — the visible noun everywhere |
| 4 | the six Operation Status labels, with a meaning each, canonical in COPY-STANDARD |
| 5 | **`Demand no longer required`** + its supporting line |
| 6 | **`Covered by {count} Draft POs`** / `Covered by 1 Draft PO` |
| 7 | region **`Purchasing on Hold`** · row `On hold until {date}` · Held by · Reason · Held time · Resume date |
| 8 | **`Supplier not assigned`** + its supporting line |

**`Issue PO`'s five strings were DERIVED, not dictated, and that is stated rather than
hidden.** Loo ruled the word in Q1 and gave five strings for `Prepare PO` only; acceptance
test 3 requires both actions to have one complete definition. They were written to the same
pattern — `Issue PO to {supplier}` · button `Issue PO` · `PO issued to {supplier}` ·
`No draft purchase orders are ready to issue.` — and **no placeholder token was invented**
for the PO number, so the done message stays parallel to `Draft PO prepared for {supplier}`.

**Two things this card had to decide because the repository proved a conflict:**

1. **The verb dictionary went SIX → SEVEN.** It says *"no module invents a seventh"* and
   states the bar for one: no existing verb fits, and the alternative is a module inventing
   its own. **`Prepare` clears exactly that bar** — `Issue` is the SECOND act, `Send` would
   name the thing that has not happened, and `Assign` · `Call` · `Upload` · `Close` ·
   `Return` are about other objects. `Issue PO` needed nothing new: `Issue` already means
   *the SYSTEM produces a formal document*.
2. **`Send` is retired as an action verb and STAYS BANNED FROM REUSE.** It was pinned to
   raising a PO; nothing is named `Send` any more. The pin does not lift with it — a word
   with no owner is not a free word, and the Ready Stock carry-forward
   (`ready-stock-plan-review-has-no-ruled-words`) reasons from that pin.

**The Orders side had to move, and the evidence is why.** The instruction was to leave Orders
alone *unless its actual meaning is also incorrect*. Measured: `docs/ORDERS-WORKING-FLOW.md`'s
`Send PO to {supplier}` is the SAME act, not "sending an already-created PO" — same trigger
(*a goods line needs buying and no PO covers it*), same completion (*a PO exists for the
line*), and a checklist folding both halves. Its stated meaning is now wrong, so the exception
applied: Orders shows the two ruled actions and points at the Purchasing table for their
definitions, which is that file's own existing discipline (*"Orders reads them, never
re-states them"*).


## P7 · To Order becomes the Planning Workspace

**Goal:** make the frozen purchasing information architecture true on the To Order tab.

**READ FIRST, BOTH, IN FULL:**
[`docs/PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md) (frozen 2026-07-29 —
the seven regions, the legal overlap, the seven model rules, the boundary) and
[`docs/PURCHASING-WORKING-FLOW.md`](PURCHASING-WORKING-FLOW.md) §1 · §7 · §9.

**✅ THE TERMINOLOGY IS FROZEN — P6 ruled all eight slots on 2026-07-29.** Every word this
card needs exists in `docs/COPY-STANDARD.md`. **Nothing here is blocked on a word any more**,
and a chat that invents one has broken rule 8 for no reason at all.

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
| **G5** | **`Check in` must leave To Order, and no information may leave with it.** To Order's receiving stage states the **customer name / SO number** per entry; the Receiving tab does not carry that fact. **The To Order implementation is not removed until Receiving carries: PO · supplier · customer name · SO number · warehouse · ETA · quantity still to receive** | `OperationPurchase.tsx` → `OperationReceiving.tsx` |
| **G6** | **`Confirm ready date` cannot be closed.** No route in the portal writes `purchase_orders.expected_ready_date`; the only supplier-facing write inserts one audit sentence and touches no date. The queue can only grow. **This is P5's finding and P5 still owns the fix** — P6 must not ship a To Order whose second queue is permanently red without saying so on screen | `apps/api` |

### Order of operations

1. **The shape decision comes first and is written down before any code**: UI-KIT §8.2's
   stage-vs-queue test applied to the NEW composition of To Order. **The test is the empty
   state, never the look.** §8.2 currently describes the OLD three cells and says so.
2. **G5 before the removal.** Receiving gains the facts first; only then does `Check in`
   leave To Order. Doing it in the other order deletes information.
3. Everything blocked on a word waits for Jess. Report it; do not name it.

**Migration:** none expected — To Order stores no work-in-progress object (Loo, 2026-07-30 —
the Purchasing clean restart). If one is ever needed: **draft to Jess first (guardrail #8);
number from the TRACKER at apply time, never from `ls`. Apply and verify BEFORE merging.**

**P7 runs AFTER P6, which is ✅ DONE.** **P4 is FROZEN and this card may unfreeze it
only where the new architecture requires it**
(Loo, 2026-07-29) — no unrelated refactoring of 0307's objects.

**Done when:** no real procurable demand can leave the purchasing workload silently, held
demand states who held it and until when, and `Check in` has left To Order without a single
fact being lost.

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

---

# ⭐ LOO UNFROZE To Order, 2026-08-04 — P8 · P9 · P10

> **The freeze that stops applying, and why.** Jess froze To Order on 2026-08-01
> (*"现在批准这一个 checkpoint。不要继续加功能。"*). That freeze was ruled after **five layout
> rewrites in one sitting** — it froze the LOOK so nobody redesigned it a sixth time. It was
> never a ruling that the tab is finished. Loo reviewed the tab on 2026-08-04, named three
> things it cannot do, and ruled them in. **THE OWNER RULE applies: no rule in this repo is
> frozen against Loo.** The frozen LAYOUT still stands — P8-P10 add to it and redesign nothing.

**What Loo decided, 2026-08-04. Four rulings, all final — no chat re-asks them.**

1. **Category rows carry a number.** They are hard-coded `count={null}` today (6 rows,
   `OperationToOrder.tsx:955-971`) while the PO Schedule rows above them carry counts.
2. **The number is UNITS, and it prints bare — no unit word.** `Mattress 7`, never
   `Mattress 7 件`. **This needs no COPY-STANDARD ruling: a bare number is not a word.**
3. **The system SUGGESTS, the human TAKES.** His words: *"我要的就是有一个自动建议补货，不过我们
   可以手动选择要不要拉。"* So there is **no free-typed quantity box.** A row's quantity falls
   because the operator accepted a suggestion, which means the REASON is recorded by
   construction. Free typing may be added later if he asks; nothing here blocks it.
4. **Layout = AutoCount's inline expand (his option B).** Not a third pane — a third pane
   narrows the grid and reopens the frozen two-pane layout. `⊞` on the row, detail underneath.

---

## P8 · A typed purchase demand can actually be saved

**Lane: PURCHASING · touches `supabase/migrations` · `apps/api` · `packages/shared` and ONLY
the `CreatePurchaseDialog` region of `OperationToOrder.tsx` (line 1359+).**
Runs at the same time as P9 and D0.5d.

**Why.** `+ Create Purchase` opens a real dialog and **its Save goes nowhere** — the page's own
comment says so: *"The dialog is real; its SAVE arrives with the unified purchase_demands
card."* Warranty · Display · Office · Spare Parts demand **cannot be recorded at all today.**
This is the biggest hole in the tab and nothing downstream can be right without it.

**ALREADY DESIGNED — build it, do not redesign it.** `CHECKPOINT-to-order.md` §0A froze the
table: fields **Source · Purchase Item · Supplier · Qty · Required By · Remark · Created
By/At · Cancelled At/Reason**; **no status column** (open/ordered/done are DERIVED from PO
links; only cancellation is stored); **no free-text items** — a Purchase Item master.

**ONE ADDITION Loo's 2026-08-04 ruling requires, and it goes in NOW.** The frozen text says
*"NO partial qty (one row = one issue; upgrade later if the business ever needs it)."* Loo
ruled the business needs it — a demand's quantity falls when ready stock is taken (P10), so a
row must survive being partly satisfied. **Build the store able to say `issued` and
`remaining` from day one.** Adding them later means a migration on a live table plus a rewrite
of every reader; adding them now costs two columns nothing reads yet.

**Done when.** Type a demand → Save → it is in the database → it appears in tomorrow's To
Order list. Cancel is recorded, never deleted. A test proves a partly-issued demand keeps its
remainder. No new visible word (§0A's list already covers this dialog).

**Must NOT.** ❌ add a status column · ❌ allow free-text items · ❌ touch the rail, the grid
columns or the toolbar (P9 and P10 own those regions of the same file — stay inside the dialog).

### ✅ SHIPPED 2026-08-04 — and HALF THE CARD WAS ALREADY BUILT WHEN IT WAS WRITTEN

**The card's own premise was stale, and measuring it first is what kept this card small.**
*"`+ Create Purchase` opens a real dialog and its Save goes nowhere"* was true when the card
was written and false by the time it was claimed: **PR #581 (migration 0319, 2026-08-03) built
the whole create path** — the dialog posts to `POST /api/operation/purchase/to-order/demand`,
`purchasing_create_demand` writes the row, and `33e68554` fixed the half that saved it and did
not show it. Measured live before building anything: `purchase_demands` exists, both RPCs
exist, **and it holds one real row** (`SONIC-S`, qty 5, never ordered). So three quarters of
the Done-when was already true and was VERIFIED rather than rebuilt.

**What was genuinely missing is the card's own ONE ADDITION, and only that.** 0319 froze
*"NO PARTIAL QUANTITY. One row = one issue"*; Loo ruled on 2026-08-04 that the business needs
the other thing, and the owner rule says the older text does not outrank him.

**Migration 0320 — one writable counter, one derived number.** `issued_qty` is the units that
have stopped being something to buy; `remaining_qty` is **GENERATED** (`qty - issued_qty`), so
it is a real column the index and every reader can use and it **structurally cannot disagree**
with the counter. Two stored numbers that must agree is the disease this repo keeps paying for.

**`issued_qty` deliberately does NOT split by cause** — a purchase order today, a ready-stock
take when P10 lands. The cause is already recorded where the act happened (`purchase_order_lines`
says what was ordered; K4's pool-draw ledger, 0292/0294, says what was drawn and why). Splitting
it here would be a second telling of a fact that already has a home, **and it would make P10
alter a generated expression on a live table — the exact cost this card exists to avoid.**

**"Still to buy" stopped meaning "has no purchase order".** The old predicate (`po_id is null`)
reads a partly satisfied demand as finished — precisely the row this card exists to keep alive.
The index, the api read and the grid's quantity all moved to `remaining_qty > 0` together.

**The issue path stops PATCHing the table and goes through a door, which is 0316's rule applied
here word for word.** `purchasing_demand_record_issue` **ADDS** the quantity taken rather than
setting a total (two documents taking from one demand must add up, and a caller that computes
the new total has to read the old one first — a race), takes the row `FOR UPDATE`, and refuses
an over-issue **by name and with both numbers**, with the table's own CHECK behind it in case a
second door is ever written. That is P10's *"taking twice cannot over-draw"* available before
P10 starts.

**Proved on production in a rolled-back transaction, not argued: 8 assertions** — a live demand
comes through 0 issued / remaining = qty · a new demand is born 0 of 5 · **a part issue of 2
leaves remaining 3, and the row is still open work** · a second document takes 1 more and the
two add up while the FIRST purchase order keeps the link · an over-issue is refused as
`over_issue` · the CHECK refuses it even without the door · a cancelled demand takes no more.
**Rollback verified total** (0 new columns, 0 new function, 0 probe rows, the index predicate
still the old one). **The negative control fired**: with the guard removed the same harness
booked issued 99 / **remaining −94**. The applied function is **byte-identical to the reviewed
repository file** — `md5(prosrc)` `273dd249d4d88e184406ce1d7d6ba9a1`, 2008 chars.

**A method note worth not re-learning: a control that did not run is not a control.** The first
attempt at the api negative control shelled out to `python`, which is not installed here; the
edit never happened, the suite passed 44/44, and that green was evidence of nothing. Re-run as
a real edit, the two controls fire **exactly 3** (revert the read) and **exactly 1** (revert the
door to a PATCH).

**A defect found in the ALREADY-SHIPPED half, reported and NOT fixed here.** A ready-stock demand
for a **sofa** projects as **1**, whatever quantity was typed — `to-order.ts` rules that a sofa
build IS one sofa however many module lines it has (`isOnePoPerOrder`), and a typed demand has
no build key, so qty 5 becomes one build of 1. It was found because the first test fixture used
a sofa SKU and measured the sofa rule instead of the remainder. **It is a business question, not
a bug to quietly patch** — does a ready-stock demand for 5 sofas mean five separate builds, or
one line of 5? — and the sofa grain is frozen law. Live exposure today is zero: the one real
demand is a mattress. The fixture is a mattress now, deliberately.

**Four more findings, reported not built.**
1. **`purchasing_cancel_demand` is untouched, and that is a decision.** Its gate refuses a demand
   already on a purchase order. Once P10 can satisfy part of a demand from stock, *"may the
   operator cancel the REMAINDER of a demand that was partly ordered?"* becomes a real business
   question with two defensible answers — **Loo's, not a migration's**. Today the two readings
   are indistinguishable (the issue path takes the whole demand, so `po_id is not null` and
   `issued_qty > 0` are the same set).
2. **No operator can cancel a demand at all.** The RPC exists; there is **no api route and no
   button**. A route with no caller is what card C1 deleted as *"a bypass one curl away"*, so
   none was added — the door and the control ship together, on the card that gives the operator
   the control. The store records a cancellation; nothing can yet ask it to.
3. **The dialog region was not edited, and needed no edit.** The card bounds P8 to it; the bound
   is not a quota. Zero web files changed, so no Pages deploy was required by this card.
4. **0318 and 0319 are applied and ABSENT from the migration tracker** (both run through the SQL
   editor). Numbering off the tracker tail alone would have handed out 0318 and collided with two
   live sets of objects. **The number is the MAX of tracker tail · repository tail · every
   branch** — 0317 · 0319 · 0319 → 0320, and 0320 went through `apply_migration`, so it IS in the
   tracker.

**Gates:** api tsc **0** · api suite **2061 passed, 3 pre-existing** (`supplier/pos` ×2 ·
`partner/pickups` ×1 — baseline, zero new) · `to-order.test.ts` **39 → 44** · web To Order page
**41/41** untouched. **No new visible word** (§0A's list already covers this dialog).

---

## P9 · The page says how many of each you are buying

**Lane: PURCHASING · touches ONLY the rail and footer regions of `OperationToOrder.tsx`.**
Runs at the same time as P8 and D0.5d. Smallest of the three — expect it to merge first.

**Why — measured on the live page 2026-08-04.**

```
PO SCHEDULE            CATEGORY
  Overdue      3         All                  ← count={null}
  Wednesday    2         Mattress             ← count={null}
  Friday       0         Bedframe             ← count={null}
  Monday       3         Sofa                 ← count={null}
                         Pillow               ← count={null}
                         Mattress Protector   ← count={null}
```

Loo cannot answer *"how many mattresses am I buying today?"* anywhere on this page. The grid
prints a per-row `Qty` and **nothing totals it.**

**Build — two places, and the two numbers mean different things.**

1. **Rail CATEGORY rows** — total UNITS in view, bare number. **The PO Schedule rows above
   count ORDERS**; two adjacent columns of numbers meaning different things is how a number
   gets misread, so the two must be told apart in the row's own tooltip.
2. **Footer, beside the Issue button** — units per category **for what is TICKED**:
   `勾选 4 · Mattress 7 · Bedframe 1 · Sofa 1   [Issue 2 POs]`.

**The batch is VIEW-SCOPED (the frozen Excel law).** A tick hidden by a filter neither counts
nor issues — so the footer's numbers must come from the same list the Issue button acts on,
not from a second count. Prove it with a test that filters, then asserts the footer moved.

**Done when.** Both numbers correct on live data, checked in a browser and quoted in the PR ·
a zero category still renders its row (unlike a queue, a category is a fixed vocabulary —
hiding `Sofa 0` would make the rail's shape change under the operator) · no unit word on
screen · footer disappears with the selection.

**Must NOT.** ❌ print `件` or any unit word (Loo, 2026-08-04) · ❌ count orders in the
CATEGORY rows · ❌ touch the grid columns or the dialog.

---

## P11 · A sofa that has no modules is counted like everything else — ✅ SHIPPED 2026-08-04 (PR #589)

**Lane: PURCHASING · touches `packages/shared/src/to-order.ts` and its tests. No web page,
no api, no migration.** Collides with nobody — open it now, alongside P9 and D0.5d.

> **What shipped, and the one thing this card did not know.** The card scoped the defect to
> what is DISPLAYED. It is also what is RECORDED: `apps/api` credits
> `purchasing_demand_record_issue` with the BUILD's quantity while the purchase order is
> written from the LINE's, so a sofa demand of 5 was ordered in full and recorded as 1 —
> and the remaining 4 came back to be bought a second time. One fix closes the grid, the
> row and the ledger together, and the api test asserts the two numbers are the same one.
>
> The row also stopped being computed twice. `builds.length` is gone; the row is
> `builds.reduce(+qty)` for every category, so a row and its builds agree by construction.
>
> **Live effect today: none, measured** — 12 sofa groups on prod, 9 genuine multi-module
> builds and 3 lone lines all at qty 1.

**This is a DEFECT, not a business decision, and it was ruled so rather than put to Loo.**
P8 reported it as an open question. Read against the code it is not one.

**The line, verified on `origin/main` 2026-08-04** (`to-order.ts:940`):

```js
qty: isOnePoPerOrder(category)        // isOnePoPerOrder === (category === "sofa")
  ? 1                                  // a sofa build is ALWAYS 1
  : members.reduce(…)                  // every other category sums the real quantity
```

and one level up (`:959`) the row repeats it — sofa counts `builds.length`, everything else
counts pieces.

**Why the `? 1` is right where it was written, and wrong here.** A customer's sofa is three
`order_lines` — `1B(LHF)` + `CNR` + `2A(RHF)`, each qty 1 — and summing them reads as three
sofas. The rule collapses MODULE LINES into one physical sofa. **A typed purchase demand has
no modules**: it is one SKU and one number, structurally identical to a mattress. Applying a
module-merging rule to a row that has no modules is the whole bug.

**It is WIDER than the demand path, and that is measured.** The grouping key is
`l.buildKey ?? "line::" + l.lineId`, so **any** sofa line with no build key becomes its own
build and is then forced to 1 — **including a real customer order line.** A customer ordering
two identical non-modular sofas on one line would raise a PO for one. Counted on prod
2026-08-04: **0 such lines today**, so nothing is wrong in the field right now. **Fix the
rule, not the demand path**, or the customer case ships as a landmine.

**The failure is silent, which is what makes it urgent rather than tidy.** Type 5, store 5,
the grid shows 5, the PO says 1 — and no surface anywhere says a number changed.

**Build.** A build's quantity comes from its members whenever the build is a single line
carrying its own quantity. The collapse stays for genuine multi-module builds — that rule is
frozen and correct.

**Done when.** A ready-stock demand of 5 sofas proposes 5 and issues a PO for 5 · a real
three-module customer sofa still proposes exactly 1 (regression-tested, since that is the
rule being preserved) · a customer line of 2 non-modular sofas proposes 2 · the row total and
the build totals agree · a negative control fires (restore the `? 1` and exactly the new tests
go red).

**Must NOT.** ❌ delete `isOnePoPerOrder` — it still decides the PO boundary (one sofa PO per
customer order), which is a different rule that stays · ❌ touch `OperationToOrder.tsx`
(P9 and P10 own it) · ❌ change how modules group.

---

## P13 · The take path says what it means — one button word, one reason word

**Two rulings by Loo on 2026-08-04, ONE card** — both are the vocabulary of the same act
(taking a unit off the ready pool for an order), and splitting them would mean two chats, two
PRs and two passes over the same code path.

### ① `Take` becomes `Reserve` — one act may not have two words

**The finding (P10's stand-down chat):** To Order's new button says **`Take`**, while the
order drawer's picker has said **`Reserve {n} to {soRef}`** for the same act **since
2026-06-30**. One act, two words, two screens — rule 8's failure.

**Loo ruled `Reserve`, and his three reasons are the record:**

1. **It is more accurate.** The goods do not leave — they are LOCKED until delivery. `Take`
   reads as *already gone*, and an operator who believes stock has left will not chase it.
2. **It came first.** Live since 2026-06-30; an older word that is not wrong is not replaced.
3. **It names the party.** `Reserve 2 to SO-1209` says who it is for; `Take` cannot.

**Build.** To Order's button and every string around it read `Reserve`. **The drawer is NOT
touched** — it is already right, and this card exists so the newer screen matches the older
one, never the reverse. A source scan asserts `Take` is gone from the To Order take path.

### ② The pool ledger gains a sixth reason

**Lane: PURCHASING · migration + `packages/shared` + the one picker. AFTER P12** (it edits
the same grid region's take path). Small.

**LOO RULED IT, 2026-08-04 — add the word. Final.**

**Why.** P10 takes units off the ready pool and must say why. K4's list, read from the live
CHECK on `ops_stock_pool_usage`, is exactly five:

```
sales_urgent · supplier_delay · warranty_exchange · vip · other
```

**Not one of them describes a To Order take**, which is *"we had it on the shelf, so we did
not raise a purchase order."* So P10 records every take as `other` with a note — correct of
that chat, because inventing a sixth word would have been ruling on a locked vocabulary.

**What it costs to leave alone, and it is the whole reason Loo ruled A.** K4 exists to answer
**为什么一直缺货**. If every To Order take reads `Other`, the monthly usage split says the
pool drained for unknown reasons — a report that cannot answer the question it was built for.
The other four words keep their meaning; only the missing one is added.

**The word.** Proposed: **`Used instead of ordering`** (key `used_instead_of_ordering`) — it
names the act from the pool's side, which is what every other word in the list does
(`warranty_exchange`, `vip`). **The UI is English-only** (PR #209). If Loo prefers a different
word, it is a one-word change and nothing else moves.

**Build.** A migration widens the CHECK to six · the shared constant gains the sixth · P10's
take path records it instead of `other` · the `other`-needs-a-note rule is untouched · K5's
monthly split shows it as its own line.

### Done when (both halves)

The To Order button reads `Reserve` and `Take` is gone from that path, proved by a source
scan · **the drawer's wording is byte-identical to before** (assert it — this card moves the
new screen to the old one, never the other way) · a To Order take records the new reason, not
`other` · the five existing reason words are byte-identical in the CHECK, the constant and on
screen · a take with no reason is still refused · **no backfill of the `other` rows already
written** — they are the honest record of what the system could say at the time.

### Must NOT

❌ change the drawer's `Reserve {n} to {soRef}` · ❌ rename or re-order the existing five
reasons · ❌ backfill history · ❌ make the reason optional · ❌ touch the cancel path
(that is P12) or anything outside the take path.

### ✅ SHIPPED 2026-08-04 — PR #599 `8ac7787f` · migration **0322 applied** · web `index-CT-nebMG.js` · Worker `b74c98f9`

**A RENAME CARD'S REAL RISK IS HARMONISING IN THE WRONG DIRECTION, so both halves are
asserted, not one.** The page renders no `Take` / `took` anywhere, and a SOURCE SCAN pins the
drawer's four strings (`Reserve ${checked.size} to ${soRef}` in both `ReserveStockDialog` and
`StockPickerGrid` · `Reserve ready stock` · `Reserve this unit to ${soRef}`) character for
character. Harmonising the OLDER screen onto the newer one fires that test — proved as a real
edit, and it fires exactly 1.

**THE PAST TENSE MOVED TOO, and that is the half a rename forgets.** `took 2 from stock` — the
Model-column fact explaining why a row's quantity fell — is now `reserved 2 from stock`: it is
the past tense of the BUTTON's own verb, so the act and the record of it read as one thing.
The whole-page assertion is what caught it: a scan for `Take` alone passes on `took`.

**THE ROUTE PATH STAYS `/take-stock`, deliberately.** It is a wire contract, not a word an
operator reads, and renaming it would break a browser open across the deploy for nothing. P13
rules the VOCABULARY. The wire key `taken` stays for the same reason.

**THE SIXTH REASON IS APPENDED, NOT INSERTED, AND THE COST IS ON THE RECORD.** The Must-NOT
forbids re-ordering the five, and `POOL_USE_REASONS` is also the DISPLAY order of the monthly
split and of all three reason pickers — so putting `used_instead_of_ordering` in its natural
place (before the catch-all) would have MOVED `other`, changing a screen nobody asked to
change. **So `other` is no longer last**, and that is the price of not moving a locked list. A
test pins the first five by index; putting the sixth before `other` fires it (2).

**THE CHECK ALONE WOULD HAVE BEEN A HALF-FIX, and finding that out was the useful part of
reading the code rather than the card.** The five-word list lives in FOUR places: the CHECK,
`ops_stock_pool_draw`'s own body (0292), `ops_stock_takeout`'s own body (0294), and the shared
constant. The shared constant feeds `opsStockReserveReasonSchema`, the zod enum guarding BOTH
routes and all three pickers — so widening the CHECK and the constant while leaving the two
RPC bodies at five would put a word in every dropdown that the server refuses by name. That is
exactly the disease `poolDrawProblem`'s own comment was written to prevent. **0322 widens all
three SQL sites; the constant makes the zod enum follow for free.**

**A CONSEQUENCE REPORTED RATHER THAN HIDDEN: the sixth word appears in the MANUAL pickers
too** — the order drawer's reserve picker and the On-hand reserve/takeout dropdowns — because
the card's own instruction is *"the shared constant gains the sixth"* and that constant is what
those pickers render. It is honest there (a manual reserve made instead of ordering IS that
reason) and the alternative was a second list, which is the thing K4 exists to avoid. **No
picker file was edited; the diff outside the To Order take path is zero.**

**THE NOTE STOPPED SAYING THE REASON'S OWN SENTENCE.** P10 wrote `To Order · taken instead of
raising a purchase order · {build}` because `other` explains nothing by itself. With the reason
now carrying that sentence, the note keeps only what the reason CANNOT say — WHICH build —
and reads `To Order · {build}`. Restoring the old text fires shared 2 + api 1.

**NOBODY WAS BACKFILLED, and today that is trivially true rather than carefully avoided:
`ops_stock_pool_usage` holds ZERO rows on production** (measured before and after). K4's ledger
has never been written to, because the To Order offer has never matched anything on live data
— P10's own measurement, unchanged. So the live effect today is **none**, and what changes is
that the first draw ever recorded will name itself instead of reading `Other`.

**VERIFIED ON PRODUCTION, BEFORE AND AFTER, WITH THE CONTROL FIRST.** The negative control ran
BEFORE the migration and **fired — the live pre-0322 CHECK refused `used_instead_of_ordering`**,
so everything after it is evidence rather than a tautology. Then 6 of 6 assertion groups in a
rolled-back transaction (**rollback proved total**: CHECK back to five, both function md5s
unchanged, 0 stray rows), then apply, then **the applied bodies reconciled BYTE-IDENTICAL to
the committed file** — `md5(prosrc)` `0c074fa0…` (4197) and `862710c2…` (2438), recomputed from
`git show HEAD:…` rather than from the working copy. Post-apply on live: 4 of 4, rolled back.

**FIVE NEGATIVE CONTROLS, EACH A REAL EDIT, EACH VERIFIED APPLIED, EACH FIRED**: button back to
`Take` → shared 2 + web 2 · api reason back to `other` → 1 · the sixth inserted before `other`
→ 2 · the drawer harmonised the wrong way → 1 · the note repeating the reason → shared 2 +
api 1. **One did not apply on its first attempt and is recorded**: a `node` replace with `\n`
in the pattern silently matched nothing, because the file is CRLF — P11's and D0.5d's trap for
the third time. Re-run CRLF-aware, it fires.

**Gates.** shared **2118/2118** · api tsc **2, unchanged** (`to-order.test.ts` `TS2571` ×2 —
**pre-existing, measured on the tree WITHOUT this change too**, so the §17.1 line reading
"api tsc 0" is stale) · api suite 3 pre-existing (`supplier/pos` ×2 · `partner/pickups` ×1),
`to-order.test.ts` 76/76 · web tsc **0** · web suite **16 pre-existing, zero new** ·
**check-design 8368, identical category for category to `origin/main`**, proved by linting a
detached worktree at main rather than by stashing.

**DEPLOYED and proved in BOTH directions on downloaded bundles, with a control marker.**
`to-order-reserve-` is **0 in the predecessor** (`index-mIdlwTf2.js`, fetched from its OWN
deployment URL `5d939d45` — a superseded asset 404s at the apex and a grep of that error page
reads as a clean 0 for everything) and **1** here; `to-order-take-` is **1 → 0**;
`used_instead_of_ordering` is **0 → 2**; and `to-order-stock-` is **1 in BOTH**, which is the
marker proving the predecessor was really read. Four canonicals on the first poll, live file
md5-identical to the local build (`c40ed713…`, 4,761,762 bytes), `SERVICE_ROLE` **0**.

**THE WORKER WAS OWED and needed no import argument** — `apps/api/src/routes/operation/to-order.ts`
is a direct change, measured against the LIVE WORKER'S SOURCE COMMIT `3245a59a`. `b74c98f9`
serves **100%** and `GET /health` returns **200 `{"ok":true}`**. **The route's own reason
string could not be content-verified from this session and that is recorded rather than papered
over**: auth runs before routing, so a 401 proves nothing (P1's lesson) and no operator login
was available. What IS proved is the version serving all traffic, built from the tip that
carries it — and the RULE it reaches was verified directly against production through the live
`ops_stock_pool_draw`.

**Reported, not fixed.** (1) **Neither word is in COPY-STANDARD**, and neither was P10's
`Take`: that card recorded its three strings as *"owed a COPY-STANDARD row"* and none was
written. P13 changes two of them and adds a sixth reason label, so the debt is now five words
(`Reserve {n}` · `reserved {n} from stock` · `{warehouse}: {n} available` · `{model} — {n}
available` · `Used instead of ordering`) plus K4's own five, which have never had rows either.
**Writing a dictionary section for two modules' worth of words is not this card's scope and
would be a rename chat ruling on Purchasing's and Ready Stock's vocabulary at once.**
(2) `POOL_USE_REASON_LABEL` is now the display word in three pickers this card did not open —
worth one look from whoever next owns Ready Stock.

---

## P12 · A demand can be cancelled — and the remainder of a part-ordered one can too

**Lane: PURCHASING · the grid row of `OperationToOrder.tsx` + a route + a migration.
STARTS AFTER P10**, which owns that grid region. The door and the button ship in ONE card:
**a route with no caller is the bypass C1 deleted**, and a button with no door is a lie.

**LOO RULED IT, 2026-08-04 — final, no chat re-asks it.**

> **A demand that has already been part-ordered CAN have its remainder cancelled.**

His reasoning, and it is the business rule: *"ordered 3, don't want the other 2"* is an
ordinary day. **The 3 already ordered are the purchase order's problem** — stopping those runs
through the PO flow (`PURCHASING-WORKING-FLOW.md` §9), not through here. Today's gate refuses
the moment `po_id` exists, so **the migration relaxing it is the card's real work.**

**Why it is not optional.** Without it a part-ordered demand can only ever grow — the disease
already named on `Confirm ready date`, a queue with no way out. And measured today: **nobody
can cancel ANY demand at all**, so a mistyped row nags forever.

**CANCEL IS NOT DELETE, and the line between them is Loo's, 2026-08-04.** He named
AutoCount's real weakness — *"backend dont know how can delete due to when testing"*: it
records everything and cleans nothing, so a test mistake is permanent.

| | Who it is for | Button? | Record? |
|---|---|---|---|
| **Cancel** | real business — *"ordered 3, don't want the other 2"* | ✅ yes | ✅ kept forever |
| **Purge** | test rubbish | ❌ **NEVER a button** | — |

**No delete button, and the reason is C1's:** *a live route with no caller is a bypass one
curl away.* A delete built for testing survives into production as a way to erase a real
purchase record leaving no trace. **Test data is cleaned by SQL on request, and the whole
database starts clean at go-live** — CLAUDE.md's standing rule, so this needs no feature.

**AutoCount is the shape to copy here, and Loo's own screenshots are the evidence:** its
Purchase menu carries **`Cancel Purchase Order` as its own document**, and SO Batch Posting
carries **`Outstanding Qty`** beside a **`Partial`** status. Cancelling the OUTSTANDING
BALANCE is a first-class act there and leaves a record. **Our `remaining_qty` IS AutoCount's
`Outstanding Qty`** — so this card gives the concept the team already knows.

**The numbers stay automatic.** `remaining_qty` is `GENERATED ALWAYS (qty - issued_qty)`, so
a cancel sets the remainder to nothing and the row leaves the workspace by itself. **Nobody
types a quantity and nobody can type a wrong one** — the reason P8 generated it rather than
stored it.

**Build.** Relax the cancel gate so a part-ordered demand may cancel its REMAINDER (never the
issued part) · a reason stays mandatory (`cancel_reason` already exists) · the route and the
row's button in one card · a cancelled demand leaves the workspace and stays readable.

**Done when.** A never-ordered demand cancels · a 3-of-5 demand cancels its remaining 2 while
the 3 keep their PO link · cancelling twice is refused · no reason is refused · **no delete
path is added anywhere** (assert it) · the row disappears from To Order with no number typed.

**Must NOT.** ❌ add a delete route or button · ❌ let a cancel touch the issued quantity or
the PO · ❌ ship the route without the button · ❌ touch the rail or the dialog.

### ✅ SHIPPED 2026-08-04 — PR #598 `3245a59a` · migration **0321 applied** · web `index-mIdlwTf2.js` · Worker `59bdd682`

**ONE LINE OF GATE CHANGE IS THE WHOLE CARD**, and 0320 had already written down which
line: `po_id is not null → already_ordered` becomes `remaining_qty <= 0 →
nothing_to_cancel`. The old gate asked *has anything been ordered?*; the new one asks *is
there anything left to cancel?*, which is the question the operator is answering and the one
0320 made askable by GENERATING `remaining_qty`.

**THE CARD'S "a cancel sets the remainder to nothing" IS NOT WHAT SHIPPED, AND THE CARD'S
OWN Must-NOT IS WHY.** The obvious reading — set `issued_qty = qty` so the generated
remainder falls to 0 — is refused by *"❌ let a cancel touch the issued quantity"*, and it
would also be a lie: `issued_qty` means *units something TOOK*, so a demand of 5 with 3
ordered would read as 5 procured. Nothing is written but `cancelled_at` + `cancel_reason`,
and the row leaves by itself because `purchase_demands_open_idx`, the api read and the grid
**all already key on `remaining_qty > 0 AND cancelled_at is null`** — the second half was
there before this card was written.

**SO THERE IS NO CANCELLED-QUANTITY COLUMN, and that is a property rather than a decision to
trust.** `purchasing_demand_record_issue` refuses a cancelled demand, so `issued_qty` cannot
move afterwards, so **`remaining_qty` FREEZES at the cancel and IS the record of what was
cancelled** — asserted live (T6). A stored second copy of a generated number is the disease
this table was built to avoid.

**NOBODY TYPES A QUANTITY, asserted on the WIRE and not only on the screen**: the route test
pins `Object.keys(args)` to exactly `p_id` · `p_reason`. Smuggling a `p_qty` fires it.

**`Cancel` RIDES THE `PO No.` CELL, and the placement was measured rather than picked.** That
column already asks *did this become a purchase order?*; on a row still to buy it answers
`Yet to Order`, and `Cancel` is the other answer to the same question. It also costs the
frozen layout NOTHING — the four widths sum to 93 and the two kit columns to 7, so a seventh
column could only be paid for out of `Model`, which this page's own law reserves as the one
column the spare width belongs to. At 1280 (the width Q1 and P9 were both decided at) the
grid area is ~1056px, the column is 20% ≈ 211px less 24px padding, and `Yet to Order` + gap +
button is ~141px of the 187px available.

**ONLY A ROW THAT IS ITS OWN DEMAND GETS IT** — `demand:<uuid>` — and a test pins the count
at exactly ONE across a fixture holding customer rows too. Cancelling a customer's order is
the Orders module's act; a second door to it here would be a second truth.

**THREE WORDS ADDED, NONE INVENTED.** `Cancel` is COPY-STANDARD's own verb for this act; it
is a SEPARATE constant from the existing `cancel` on purpose, because that one is the create
dialog's form-abandon button and the filter's clear label, which the dictionary exempts from
the verb table **by name**. The dialog says `Cancel Purchase` — the verb plus `Create
Purchase`'s own noun, the exact inverse of the act that made the row, and AutoCount's own
document name. **The way out of the dialog is the frame's ✕, not a second button**: two
buttons reading `Cancel` in one dialog, one meaning *stop this purchase* and one *stop this
dialog*, is the one arrangement that could not be read.

**CANCEL IS NOT DELETE, ASSERTED IN FIVE PLACES** rather than promised in prose: 0321's
sanity block proves no delete policy, no `DELETE` grant and no function deleting from the
table; a source scan on the route proves no `.delete(` and no delete path; a source scan on
the page proves no `method: "DELETE"` and that the only demand doors it opens are create and
cancel. **Adding a delete route fires three of them.**

**VERIFIED ON PRODUCTION, BEFORE AND AFTER.** Before: 8 assertions in a rolled-back
transaction (rollback proved total — function md5 unchanged, 1 demand, 0 cancelled), and the
**negative control fired: the LIVE function refused the card's own case with detail
`already_ordered`**. After: the applied function's `md5(prosrc)` is **byte-identical to the
reviewed repository file** (`d5d76292…`, body extracted from `git show`), it is **in the
tracker** (`20260804055735` — 0318/0319's lesson applied), and the live function was run
against a real 3-of-5 demand in a rolled-back transaction: `{"cancelled": 2, "issued": 3}`,
`PO-2040` kept, and the row gone from the open-demand set.

**LIVE EFFECT TODAY: NONE, measured.** Production holds ONE demand (`SONIC-S`, qty 5, issued
0, never ordered) — so the part-ordered path this card exists for has no live row yet, and
what changes today is that a mistyped demand can finally be got rid of at all.

**Five code negative controls, each fired as a real edit and verified applied**: the
demand-only guard removed → the *exactly one Cancel* test · the mandatory reason removed → 1 ·
a delete route added → 3 · the api's reason guard relaxed → 1 · a quantity smuggled onto the
wire → 1.

**Gates.** shared **2111/2111** · api tsc 0, suite 3 pre-existing, `to-order.test.ts` 64 → 76 ·
web tsc 0, suite **16 pre-existing, zero new**, `OperationToOrder.test.tsx` 58 → 67 ·
**check-design 8368, byte-identical category-for-category to the tree WITHOUT this change**
(proved by stashing and re-linting) · build clean, `SERVICE_ROLE` 0. Both Pages projects and
the Worker deployed; **all four canonicals on the first poll**, live bundle md5-identical to
the local build (`9fbc787a…`), and **both directions proved on downloaded bundles** —
`to-order-cancel-submit` · `Cancel Purchase` · `to-order-cancel-dialog` are **0 in the
predecessor** `index-AfemgCnW.js` (4,759,570 bytes, a real bundle) and **1 in the live one**,
with `to-order-create-dialog` at 1 in both as the control.

**TWO THINGS REPORTED, NOT FIXED.**

1. **`TO_ORDER_WORDS.itemsRemove` (`"Remove"`) has ZERO consumers** — measured by grep across
   `apps/web` and `packages/shared`. It belongs to the Purchase Order PREVIEW's item table,
   which is a different concept from this card's (taking a line out of a document that does
   not exist yet destroys no record), which is exactly why the delete-word scan bans
   `delete` and `purge` and NOT `remove`. Deleting an unused ruled word is a COPY-STANDARD
   decision, not a routine fix.
2. **The api route could not be content-verified from this session.** Auth runs before
   routing, so a 401 on `/demand/:id/cancel` proves nothing (P1's lesson) and no operator
   login was available here. What IS proved: the Worker version serving 100% of traffic is
   `59bdd682`, built from the main tip that contains the route, with `GET /health` **200
   `{"ok":true}`** and the correct bindings echoed — and the rule the route reaches was
   verified directly against production through the live function.

---

## P10 · Ready stock is suggested; the human decides whether to take it

**Lane: PURCHASING · touches the grid region of `OperationToOrder.tsx` + `apps/api` +
`packages/shared`. STARTS AFTER D0.5d MERGES** — it needs the kit's row expand.

**Why — and the finding is that the work is nearly all done and switched off.**

Measured 2026-08-04 by reading the engine, not by guessing:

| Fact | Where |
|---|---|
| the api DOES count free stock (`qty − reserved`, Klang) | `apps/api/src/routes/operation/purchase.ts:369-423` |
| the engine DOES compute how much a demand could take from it | `net-requirements.ts` — `coveredByFreeStock` · `freeStockAvailable` |
| **it is deliberately NOT subtracted** | `consumeFreeStock` defaults **false** and nothing anywhere turns it on |
| **and the number never reaches the screen** | To Order prints `Qty 5` with no hint that Klang holds 2 |

**Jess's 2026-07-21 ruling is RIGHT and stays:** goods are labelled per order, and auto-consuming
free stock without a WMS/scan confuses goods-in/out. **The defect is not the ruling — it is that
a decision reserved for a human is never shown to the human.**

**Build — Loo's option B, drawn by him and frozen here.**

```
closed        ⊞ ☑ Nice Future  5  Sonic S   🟢 2
                ☑ Nice Future  1  H1401S            ← no stock: nothing shown
expanded      ⊟ ☑ Nice Future  5  Sonic S   🟢 2
                   └ Klang: 2 available   [Take 2]
after taking    ☑ Nice Future  3  Sonic S   took 2 from stock
```

- `consumeFreeStock` **stays OFF**. The suggestion is advisory; taking it is an ACT.
- **Taking goes through K4's existing door** — `ops_stock_pool_draw` (migrations 0292/0294)
  already makes a draw and its reason ONE transaction across all three doors into the pool.
  **A fourth door that writes stock its own way is a second truth about the same units.**
  Taking here must reserve the units, or the next operator sells them out from under this order.
- No free-typed quantity box (Loo's ruling 3).

**Done when.** A row with stock shows the marker and nothing else changes · taking reduces the
quantity, reserves the units and leaves a dated reason readable in Ready Stock · a row with no
stock is visually untouched · **taking twice cannot over-draw** (test it) · the PO that follows
carries the reduced quantity.

**Must NOT.** ❌ turn `consumeFreeStock` on · ❌ write `ops_stock_items` directly · ❌ show a
marker when free stock is 0 · ❌ redesign the grid.

### ✅ SHIPPED 2026-08-04 (PR #591) — plus four measurements taken independently

**P10 was built TWICE on 2026-08-04 and only one of them shipped.** A second chat
(`claude/p10-ready-stock-4c0f8f`) built the same card in parallel and its work is **preserved on
origin and deliberately NOT merged**: #591 landed first and is **better on the point that decides
the feature**, so the weaker implementation must not overwrite the stronger one. The four notes
below are that chat's own measurements, kept because #591 cannot have made them.

**Where #591 is right and the parallel build was WRONG.** It reads what has already been taken off
**K4's LEDGER** (`ops_stock_pool_usage`); the parallel build read `ops_stock_items.status =
'reserved'`. A delivered unit becomes `sold`, so the reservation reading would have put a satisfied
requirement **back on the page as something to buy** the day the goods went out. The ledger is
permanent and dated; the status is not. Recorded here so the reservation reading is never
reintroduced as a simplification.

**FINDING 1 — the offer matches NOTHING on live data today, and that is not a bug in #591.**
Measured on prod 2026-08-04: the **87 free units are the AutoCount Klang import**, whose SKUs are
sheet DESCRIPTIONS (`Sonic L1202S-K` · `Haven SoftCloud-H1401S-Q` · `1013-Q BEDFRAME`), while all
**31 live demand SKUs are catalog codes** (`SONIC-K` · `H1401S-Q` · `CODY-Q`). `stockMatchKey`
survives cosmetic drift and no more — `SONIC-K → sonic|K` against `Sonic L1202S-K →
sonicl1202s|K` — so the overlap is **ZERO** and **no row can show a marker today**. This is
correct behaviour, not a defect: a looser rule would reserve the wrong physical goods. **It heals
by itself** — units minted by the portal's own receiving already carry catalog codes (`M1401F-Q` ·
`B1201S-Q` · `5539-2A(RHF)` are `incoming` on prod right now), so the first thing received through
the portal lights it up. **Nobody may "fix" this by widening the matcher.**

**FINDING 2 — one act, two words, and it is Loo's to rule.** #591 ships **`Take`** (his card's own
sketch). The identical act — draw a free Klang unit to a customer order through
`ops_stock_pool_draw` — has said **`Reserve {n} to {soRef}`** in the order drawer's picker
(`ReserveStockDialog`) since 2026-06-30, with the toast `Reserved N units to SO-…`. Two spellings
of one act on two screens is exactly what card R8 spent a sweep removing, and COPY-STANDARD's law
is one business, one dictionary. Either answer is one edit to `to-order.ts` plus one to
`ReserveStockDialog.tsx`. **Not changed by anyone yet.**

**FINDING 3 — the kit's expand control overflows its own column below ~1440px.** D0.5d gives
`expansion` a **3%** column and the control is a fixed **24px** button in a `px-2` cell.
Measured in a real browser against the built stylesheet (the page's own law — jsdom has no
widths): at **1024** the cell is 23px and the button **overlaps the checkbox by 3px**; at **1280**
it clears by 4px; at **1440** it fits. **Nothing clips and the table never scrolls sideways at any
width**, and the scanned rows stay exactly 40px (the expanded record measured 57px, which is the
one cell allowed to be tall). #591's own note measured 1280 and 1920 only. It is the KIT's
geometry, so it is reported rather than edited here.

**FINDING 4 — the offer did not ask what CONDITION a unit is in. ✅ FIXED (PR #595), and the
finding's own premise needed one correction.** #591 scoped the register read to `status='free'` ·
`needs_repair=false` · the own warehouse, and stopped there. R4 releases a quarantined unit back
to `free`, so the day a `damaged` unit was released the page would have offered it to a
customer's order. **Live exposure was zero, measured**: every free unit on prod is `new` (54) or
`exhibition` (33) — which is exactly why it was closed before the first release rather than after.

**The correction: `GET /api/ops/stock/ready` does NOT require `new` or `exhibition`.** That is
what its own header comment at `ops/stock.ts:46` says, and the CODE one line below admits
`['new','exhibition','old','refurbished']` and excludes only `damaged`. The finding read the
comment; the rule is the code. **The predicate mirrors the route's list verbatim**, so the two
surfaces cannot drift and no condition policy is invented here — narrowing to `new` +
`exhibition` would have silently stopped offering the `old` and `refurbished` units Ready Stock
itself calls ready, which is a business decision nobody made. **The stale comment is reported,
not edited: it is `ops/stock.ts`'s, not this lane's file.** Negative control fires exactly 1.

---

**Order of play, and P7 waits.** P7 rewrites this whole page against the information model;
P8-P10 are surgical. Running them together guarantees conflict. **P8 ‖ P9 ‖ D0.5d now →
P10 → then P7**, which inherits three working features instead of re-deriving them.

---

# ⭐ LOO OPENED A PURCHASE ORDERS PLAN CHAT, 2026-08-04 — Q1 · Q2 · Q3 · Q4

> **These four cards belong to the Purchase Orders manager chat** and live under this
> heading only (its charter is `docs/CHECKPOINT-purchase-orders.md` §6, 2026-08-04).
> **They do not touch `OperationToOrder.tsx`, the P8/P9/P10 cards, or the index's
> ACTIVE SET.** A Q-chat and a P-chat may run at the same time — different files —
> but two Q-chats may NOT: Q1 and Q2 both open `OperationPurchaseOrders.tsx`.
>
> **Order of play: Q1 → Q2 → Q3 → Q4.** Q1 first because it is the only one where the
> page is losing work TODAY. Q4 is Q3's numbers made large, so Q4 may not start before
> Q3 merges, or the same figure gets computed twice and the two will disagree.

## Ground truth for the Q line — measured on prod 2026-08-04, re-measure before you build

| Fact | Value |
|---|---|
| purchase orders | **21 — every one `open`, none closed, none cancelled** |
| PO lines | 35 · lines with any goods received **0** |
| `warehouse_receipts` / `receiving_events` | **0 / 0** — nothing has ever been received on this system |
| POs carrying `eta_date` (the supplier's own arrival date) | **5 of 21** |
| POs carrying `expected_ready_date` | **0 of 21** |
| `po_supplier_promises` rows | 4 — **all `kind='tomorrow_delivery'`, zero `ready_date`** |
| production-day pairs configured | 3 (Nice Future × mattress 7 · Ohana × bedframe 7 · Ohana × sofa 14) |
| supplier work weeks | Ohana off `[0]` · Nice Future off `[0,6]` |
| `purchase_order_lines.cost` | **0.00 on all 35 lines** — nobody keys a purchase price |
| `purchase_orders.sup_status` | **`pending` on all 21** — the second status axis carries no information today |

**Everything in the database is TEST data** (CLAUDE.md). These numbers are evidence about
whether the CODE behaves — never about business volume, and never a reason to write a
backfill.

## Every Q-card ships to production — this block is not repeated per card

**Engineer-Owned Delivery (CLAUDE.md §13.1) applies in full.** After the card is built you
own the whole chain without asking: rebase on latest `main` · resolve routine conflicts ·
run every gate · fix what you find · commit · push · open and merge the PR · deploy ·
verify production · append the record. **Finding another bug is an instruction to fix it and
continue, not a reason to stop.**

**Gates that must be green before you merge** (quote the numbers in the PR):

```
corepack pnpm --filter @carres/web exec tsc --noEmit          → 0
corepack pnpm --filter @carres/web exec vitest run OperationPurchaseOrders
corepack pnpm --filter @carres/shared test
corepack pnpm --filter @carres/web lint
corepack pnpm --filter @carres/web build
```

Baseline for the whole suite is CLAUDE.md §17.7 — **ZERO NEW failures is the bar**, the
listed old ones are not yours to chase.

**A NEGATIVE CONTROL IS REQUIRED and must be quoted in the PR.** Delete the line you just
wrote, run the test, and record how many tests fail. *A control that did not run is not a
control* — if it fires 0, your test is measuring nothing and the card is not done.

**WIDTHS ARE MEASURED IN A REAL BROWSER, NEVER ESTIMATED AND NEVER FROM A TEST.** jsdom has
no widths, so the page suite structurally cannot catch a truncated cell. The method that
works, and that produced every number in Q1:

```
1. .claude/launch.json → a vite entry on a free port; copy apps/web/.env.production
   to apps/web/.env.local first
2. open the page, then measure with the app's OWN loaded stylesheet:
      await document.fonts.load('400 13px Inter')
      span.className = 'text-body'; span.textContent = 'Waiting for Goods'
      span.getBoundingClientRect().width
3. DataTable cell padding is `px-2` — add 16px, not 32
```

**Deploy law.** Merge to `main` first, build from the **main tip**, deploy BOTH Pages
projects (`carres-portal` + `carres-pos`) with `--branch=main`, then poll all FOUR canonical
URLs until they converge. Download the live bundle to a FILE and grep it — never trust a
deployment log. An `apps/api` diff is measured against the **live Worker's source commit at
the moment of deploying**, not against your branch's scope.

**Verify on production with real data, and say the PO number.** Every Q-card's Done-when
names a specific live PO. Open it on `https://erp.carresofficial.com`, confirm the behaviour
with your own eyes, and write what you saw into the PR. *"Tests pass"* is not verification.

**Then append ONE dated entry to `docs/CHECKPOINT-purchase-orders.md` §6** (append only —
never edit anything above the line) and ONE line to `docs/phase-10-worklog.md`, and tick the
card in the Status table below.

### Q3's four open items — ANSWERED 2026-08-04, none of them was a business decision

> Q3 shipped and returned four things "for Loo". Read one by one, **three are `KEEP` and one
> is bookkeeping** — recorded here so the next chat does not put them to him again. **The
> standing rule they are answered under is the Design System's own:** *"If there is no
> material improvement, KEEP and say so — 'only different' is rejected."*

| # | Q3 asked | Answer |
|---|---|---|
| 1 | should a click JUMP to a filtered Purchase Orders list instead of expanding in place? | **KEEP the expansion.** Expanding keeps the operator where they are and the PO number inside it still jumps. Jumping away spends the reader's place to save one click, and it is the behaviour that makes AutoCount's own reports hard to get back out of. A parameter is cheap; the loss of place is the cost |
| 2 | add a `Group by` button? | **NO.** Its only two options — Category and Supplier — are already the rail's own filters. A second entrance to the same capability plus a word the dictionary does not have, for nothing |
| 3 | add a `Status` filter? | **NO, and it was never open.** COPY-STANDARD bans a `Status` heading by name, and all 21 live POs hold one status, so the control could not narrow anything |
| 4 | `Month` has no dictionary entry | **Bookkeeping, not a decision.** The word is already on the HR and Finance screens; Q3 copied it rather than inventing one. It joins COPY-STANDARD as a record of what is already live |

**The pattern worth carrying, because it is the one Loo keeps paying for:** a finding is not
automatically a question. Before returning one, ask whether any answer changes what gets
built — 1 and 2 would have cost work for no gain, 3 was already ruled by a law the card had
read, and 4 needed a line in a file. **None of them needed him.**

**If building the card as written would ship something wrong, STOP and tell Loo before
building.** Do not build a known-wrong thing because a card said so.

---

## Q1 · The register puts the most dangerous purchase order first

**Lane: PURCHASE ORDERS · touches `apps/web/src/pages/operation/OperationPurchaseOrders.tsx`
and `packages/shared/src/po-workspace.ts` only. NO migration. NO api change.**

### ALREADY EXISTS — never rebuild

- `poCurrentActionOf()` (`packages/shared/src/po-workspace.ts`) — the ONE action source that
  both the register column and the workspace hero read. **Do not add a second.**
- `poArrivalGapOf()` — the ONE rule that compares the arrival date against the customer's.
- `etaOf(po)` in the page — resolves confirmed date, else the engine's estimate from
  production working days. **P1's law holds: no setting → no estimate, never a silent 7.**
- `purchasingSupplierCallsOf()` — the engine's open calls, each already carrying `late`.
- The eight frozen columns and their order. **Q1 does not change which columns exist.**

### Why — measured on prod and in a real browser, 2026-08-04

**① The riskiest PO is buried, and today there is a real one.**

```
PO-2038 · Nice Future · issued 1 Aug
   customer delivery date  2026-08-04   ← TODAY
   supplier arrival date   none — the factory has never given one
   our own estimate        2026-08-11   ← 7 days after the customer's date
   where it sits           row 8 of 21
   what its row says       "Confirm Arrival" — the same words as 15 other rows
   what colour it is       none. Not red, not amber
```

The default order is `PO Issued` oldest first. **That sorts by how long the DOCUMENT has
waited, not by how close the CUSTOMER is.** Seven POs have a customer date within 7 days and
no supplier-confirmed arrival.

**② This is a law conflict, and Loo settled it 2026-08-04 in favour of risk.**
`docs/PURCHASING-WORKING-FLOW.md` §6 and `docs/ACTION-FLOW-STANDARD.md` Law 5 both say row
order is *risk to the promise*. Jess's 2026-08-02 listing law says `PO Issued` oldest first.
**Both were law and they disagreed.** Loo ruled risk-first. `PO Issued` keeps its column and
its header sort; it stops being the default. **Record the override under Loo's name in the
checkpoint, and tell Jess once — do not delete her rule silently.**

**③ The column that says what to do is the only one squeezed.** Measured at 13px Inter with
the app's own stylesheet, `DataTable` cell padding `px-2` (16px total):

```
Current Action is `width: "auto"` — it gets the LEFTOVER.
   viewport 1280  →   23px      viewport 1440  →  183px
   viewport 1366  →  109px      viewport 1536  →  279px
(portal sidebar 232 + rail 200 + workspace 400; the workspace is OPEN by default,
 so this is what an operator sees on opening the page)

The words that have to fit:
   Confirm Arrival               109px
   Open Receiving                113px
   Contact Supplier              119px
   Waiting for Goods             126px
   Confirm what happens next     186px
   Confirm tomorrow's delivery   191px
   Confirm balance delivery date 201px

Meanwhile `Goods Arrival` is a FIXED 192px carrying a 65px date.
```

At 1366 — an ordinary business laptop — **three of the seven possible words are cut off**,
with `text-overflow: clip`, so not even an ellipsis says so.

**④ A guess is painted the same red as a fact.** 10 of 21 rows print a gap warning. **8 of
those 10 are computed from OUR OWN estimate — the factory has said nothing.** The date is
grey and the warning beside it is red, identical to the 2 rows where the supplier really did
give a date. Those two situations need opposite next actions.

### Build

**1 · Default row order = risk to the customer's promise.** A new exported pure function in
`po-workspace.ts` (the register and any later surface read the SAME one — a page-local
comparator would be a second priority). Rungs, highest first:

```
1  an open engine call that is LATE            (call.late — the engine already computes it)
2  goods land AFTER the customer's date        (poArrivalGapOf → tone 'late')
3  goods land ON the customer's date           (tone 'tight')
4  an open engine call not yet late
5  everything else
   then  customer delivery date ASCENDING   (no date sorts LAST, never first)
   then  PO Issued oldest first             (Jess's rule survives as the tie-breaker)
```

A finished or cancelled PO never rises: it has no risk left. Clearing a header sort returns
to THIS order, not to `PO Issued`.

**2 · `Current Action` gets a fixed width; `Items` becomes the `auto` tail.** 200px, which
covers every word above except the two longest — and those two carry a `title`. **The
argument, and it is the durable part: the column that truncates should be the one whose
truncation costs least.** `Booqit 1B(…)` is still identifiable; `Confirm tomorrow…` is an
instruction that has been deleted. Longest live product label is 14 characters, measured.

**3 · The gap tail's tone follows who said the date.** No new word, no new label — only the
tone: **red when `etaOf(po).confirmed` is true** (the factory told us), **amber when it is
our estimate**. The two existing tooltips already say which is which; the colour now says it
too. `same day` stays amber either way.

### DONE WHEN

- On `https://erp.carresofficial.com/operation/procurement`, **`PO-2038` is row 1** and its
  arrival cell reads an amber `7d late`. Say so in the PR, with what you saw.
- `PO-2031` and `PO-2032` (supplier-confirmed, `8d late`) are **red**, and are the only red
  gaps on the page.
- Clicking the `PO Issued` header still sorts by issue date; clearing it returns to risk
  order — asserted by a test.
- Current Action is measured at **200px in a real browser** and `Waiting for Goods` renders
  whole at a 1366 viewport. **Quote the measured pixel numbers in the PR.**
- Negative controls, each quoted with its failure count: remove rung 1 → the late-call test
  fails · remove the confirmed/estimate tone split → the tone test fails · put
  `Current Action` back to `auto` → the width test fails.

### ✅ SHIPPED — what actually landed (2026-08-04, PR #590)

All three built as ruled. Full record → `docs/CHECKPOINT-purchase-orders.md` §6 and the
worklog. The two things this card did NOT predict, both recorded rather than smoothed over:

1. **A measured regression at exactly 1280.** The compact fixed sum moves 424 → 484, so the
   LISTING REGION's horizontal-scroll threshold moves from a **1257px viewport to a 1317px**
   one — at 1280 the region gains **37px** of horizontal scroll where today it has none and
   a 23px `Current Action`. The region already answers *"the columns do not fit"* that way by
   its own design (`min-w-[880px]` in expanded mode), and this card's own principle prefers a
   readable instruction to a deleted one, so **200px shipped as ruled** and the number is on
   the record instead of the ruling being quietly softened. One number if Loo wants 1280 back.
2. **Six page tests silently relied on WHICH PO auto-selects.** The row that auto-selects is
   now the most dangerous one, so those tests now say which PO they are about (`openPo(id)`).
   That is the honest consequence of the ruling, not a fixture bent to avoid work.

### MUST NOT

❌ change which columns exist, or their order · ❌ add a second comparator inside the page ·
❌ add or respell any visible word — every word on this page is already ruled ·
❌ touch the rail's five buckets (that is a separate, reported gap) · ❌ touch
`OperationToOrder.tsx` · ❌ delete Jess's `PO Issued` rule from the checkpoint — it is
overridden as the DEFAULT and survives as the tie-breaker and as a header sort.

---

## Q2 · The factory's ready date has somewhere to land

**Lane: PURCHASE ORDERS · touches `apps/api/src/routes/operation/pos.ts`,
`packages/shared/src/schemas/operation.ts`, `packages/shared/src/po-workspace.ts` and the
PO workspace in `OperationPurchaseOrders.tsx`. NO migration — and that was measured, not
assumed.**

### ALREADY EXISTS — never rebuild

- **`purchasing_record_ready_date(p_po_id text, p_new_date date, p_reason text)` is LIVE in
  production** (migration `0318_po_birth_certificate.sql`). It is `security definer`, gated
  by `purchasing_supplier_call_gate()`, takes the PO `FOR UPDATE`, refuses a PO that is not
  `open`, **appends** a `kind='ready_date'` row to `po_supplier_promises` (never overwrites —
  the table has no date column anybody can update), updates `expected_ready_date`, and writes
  a `po_history` sentence. `authenticated` holds EXECUTE; `anon` and `public` are revoked.
- The `po_supplier_promises` CHECK constraints **already allow** `kind='ready_date'` with
  `answer='ready_date'` and `po_line_id IS NULL`. Nothing about the store needs changing.
- All FIVE strings are already ruled in `docs/COPY-STANDARD.md`'s PURCHASING table:
  `Confirm ready date` · `Call {supplier} — confirm ready date` · **Button `Record ready
  date`** · `Ready date recorded` · `No supplier to call today. Everything on track.`
  **Do not invent a sixth.**
- The supplier-date door in the workspace (the in-place extend on the date row) is the shape
  to copy — same form, same Reason/Remarks split, same "the form says what Save will record
  before it is pressed".

### Why

**The door is built and has no handle.** `purchasing_record_ready_date` has **ZERO callers
anywhere in the repository** — grep it: no api route, no query, no button. So:

```
0 of 21 POs carry a ready date, and no path in the portal can ever create one.
0 of 4 promise rows are kind='ready_date'.
```

`docs/PURCHASING-WORKING-FLOW.md` §3 makes the ready date the FIRST thing that happens after
`Issue PO`, and `docs/ACTION-FLOW-STANDARD.md` Law 4 rung 3 ranks `Confirm ready date`
**above** `Issue PO`. Today it is the one rung of the purchasing flow with no way to close it.
The information model's §11 already records this: *"`Confirm ready date` has no path in the
portal that can close it"* — measured 2026-07-29 and still true.

**A second defect, and it fires the day the first is fixed.** `poDateHistoryOf()`
(`po-workspace.ts`) filters `p.kind === 'tomorrow_delivery'`. The moment ready dates start
being recorded, **the workspace's date history will silently drop every one of them** — the
ledger will hold answers the screen cannot show. Fix it in the same card or the fix ships a
lie.

### Build

**1 · `POST /api/operation/pos/:id/ready-date`** in `pos.ts`, built exactly like the existing
`/:id/tomorrow-delivery` route directly above it: a zod input in
`packages/shared/src/schemas/operation.ts`, `userClient` + the JWT (never `service_role` —
the RPC's own gate is the security boundary), and the SAME `mapSupplierCallError` so
`po_not_open` and `po_not_found` come back as readable 422/404 instead of a raw constraint
string. Input: `newDate` (required, `YYYY-MM-DD`) + `reason` (optional).

**2 · The button in the workspace.** `Record ready date`, in the SUPPLIER region beside the
existing arrival-date door. Same manner as the date door Jess ruled live on 2026-08-02:
the field starts **EMPTY** (a date already given can never be edited — the ledger only gains
a row), Save is disabled until something is keyed, and the effect sentence stays silent until
then. Done message `Ready date recorded`.

**3 · `poDateHistoryOf` learns the second kind.** It must show both kinds and must say which
is which — a ready date and an arrival date are two different promises about the same PO, and
merging them into one unlabelled list would make the slip count meaningless. Keep `slipDays`
measured within ONE kind.

### THE BOUNDARY — read this before you widen the card

**`Confirm ready date` as a QUEUE lives on the To Order tab, not here.**
`docs/PURCHASING-WORKING-FLOW.md` §1's frozen deadline-anchor rule assigns
`Issue PO · Confirm ready date` to To Order and `Confirm tomorrow's delivery · Check in ·
Confirm balance delivery date` to Receiving. This card builds **the recording door only** —
the route and the button on the PO workspace, where the PO lives.

Two things are therefore **REPORTED, NOT BUILT**, and the next chat must not quietly add them:

- **`purchasingSupplierCallsOf` has exactly two keys** (`confirm_tomorrows_delivery` ·
  `confirm_balance_delivery_date`). There is **no `confirm_ready_date` call in the engine at
  all**, so no queue tile, no due date and no count exist for it anywhere. Adding one changes
  the To Order tab, which this lane may not touch.
- **The rail's five buckets do not change.** `poWorkStateOf` reads the ARRIVAL date; a ready
  date is a different promise and must not move a PO out of `Waiting Supplier Date`. Adding a
  sixth bucket needs a word Jess has not ruled.

### DONE WHEN

- On production, record a ready date against a real open PO through the button. Then prove
  all four with your own eyes and say so in the PR: `expected_ready_date` moved · a
  `kind='ready_date'` row exists in `po_supplier_promises` with the reason · a `po_history`
  sentence was written · **the workspace's date history shows it**, labelled as a ready date.
- A second ready date on the same PO **appends** — the first row is still there.
- A PO that is not `open` is refused with a readable message, not a raw constraint string.
- Negative controls: remove the `ready_date` branch from `poDateHistoryOf` → the history test
  fails · point the route at the wrong RPC → the route test fails. Quote both counts.

### MUST NOT

❌ write a migration — the RPC, the CHECKs and the grants are already in production ·
❌ add a queue tile, a due date or a count for `Confirm ready date` · ❌ add a sixth rail
bucket · ❌ touch `OperationToOrder.tsx` · ❌ use `service_role` · ❌ invent a word — all
five strings are already in COPY-STANDARD.

---

## Q3 · Purchasing gets its report tab

**Lane: PURCHASE ORDERS · a NEW page + a NEW api route + one line in `PurchasingTabs.tsx`.
NO migration. Touches no existing purchasing page.**

> **✅ UNBLOCKED — Loo ruled the words 2026-08-04.** They are listed at the end of this card
> and they are now the only strings this page may use. **The tab is `Report`, singular** —
> his own spelling, and it matches AutoCount's own menu bar, which the team already reads
> every day. Every other word on the page must already exist in `docs/COPY-STANDARD.md`.
> **A chat that invents a sixth has broken the rule, not followed it.**
>
> **This card must also write the four new words INTO `docs/COPY-STANDARD.md`** — a ruled
> word that lives only in a card is a word the next chat cannot find.

### Why

**Carres has no "look at the numbers" screen anywhere in Purchasing.** All five tabs answer
*"what do I do with THIS document?"*. Nothing answers *"how many mattresses did we buy this
month?"* — Loo asked for it 2026-08-04 and it does not exist.

**This is a whole missing LAYER, not a missing button.** AutoCount's own Purchase menu draws
the line: the top half is documents (`Purchase Order`, `Goods Received Note`, `Purchase
Invoice`), the bottom half is reports (`Monthly Purchase Analysis Report`, `Purchase Analysis
By Document Report`, `Top/Bottom Purchase Ranking Report`). Odoo does the same with a
`Reporting` menu inside each app.

**2990s is NOT the reference here, and that was measured by reading their code
2026-08-04.** They have ONE global `Dashboard.tsx` (144 lines, sales figures only, no
purchasing at all), one cross-module `Outstanding.tsx` (8 tabs, date range), and **no
purchase report page whatsoever** — they have four `*DetailListing.tsx` files and every one
is on the sales side. **They copied AutoCount's grid and not AutoCount's reports.** Copying
2990s here would copy the gap.

**The data already answers the question.** Run today, from `purchase_order_lines` joined
through `product_skus → product_models.category`:

```
month     category    POs   ordered   received   outstanding
2026-07   sofa          5        12          0            12
2026-07   bedframe      1         6          0             6
2026-07   mattress      1         5          0             5
2026-08   sofa          8        11          0            11
2026-08   bedframe      3         4          0             4
2026-08   mattress      3         4          0             4
```

Every one of the 35 lines resolves a category — there is no unknown bucket to design around.

### Build

A read-only page with AutoCount's own shape (his fourth screenshot, 2026-08-04): filters on
the left, grouping on the right, results below, export at the bottom.

```
filter    month ▼   ·   supplier ▼   ·   category ▼   ·   status ▼
group by  category ▼           sort  most first ▼
─────────────────────────────────────────────────────────────────
category      POs      ordered    received    outstanding
sofa            8           11           0             11      → click
bedframe        3            4           0              4      → click
mattress        3            4           0              4      → click
─────────────────────────────────────────────────────────────────
total          14           19           0             19
```

**Three rules that make this a report and not a second source of truth:**

1. **It stores nothing.** No table, no RPC, no cached figure. It reads the same
   `purchase_order_lines` the register reads, and computes at read time. A report with its
   own store is a second number that will eventually disagree with the first.
2. **Every number is a DOOR.** Clicking a row lands on the Purchase Orders register with
   that month × category filter already applied, showing **exactly the POs the number
   counted**. This is the one thing AutoCount cannot do — its answer to every analysis is
   "export to Excel", and a number in Excel has left the system. *"A number its own click
   cannot produce is the first count in this portal that lies"* (P2's Claims rule).
3. **Cancelled POs are excluded, and the exclusion is stated on screen.** A silent filter is
   how two people get two answers from one report.

**NO MONEY. Ruled by Loo, 2026-08-04:** *"i dont show costing — due to supplier have own,
finance will deal with it. If future need to add, just add, not now."* The report prints
QUANTITY only. It is also currently unbuildable: `purchase_order_lines.cost` is **0.00 on all
35 lines** — nobody keys a purchase price — so a value column would print `RM 0.00` for
everything. Adding money later is one column, not a rebuild.

### DONE WHEN

- The tab renders on production and its August figures match the SQL above, re-run on the day
  you ship. **Quote both the screen and the query in the PR.**
- Clicking `sofa` lands on the register showing exactly those POs — count them and say the
  number.
- The month filter changes the figures; an empty month says so in words rather than printing
  zeros with no explanation.
- No money anywhere on the page — prove it with a source scan for `RM`, `cost`, `total` in
  the new files, and quote the result.
- Negative control: break the cancelled-PO exclusion → a test fails. Quote the count.

### MUST NOT

❌ create a table, an RPC or any stored figure · ❌ print money · ❌ touch the register, To
Order, Receiving, Claims or Settings · ❌ invent a word — see the block below ·
❌ add a Refresh button (a report recomputes itself and states when it did).

### THE WORDS — RULED BY LOO 2026-08-04. These six and no others.

| What | The word | Status |
|---|---|---|
| the tab | **`Report`** — singular | **NEW.** Loo's own spelling, given verbatim. It is also AutoCount's own menu-bar word, which the team reads daily — so this is the word already in their mouths, not a new one. **`Reports` and `Reporting` are both wrong; do not "correct" it** |
| column 2 | **`POs`** | **NEW.** `PO` is already ruled as the document's name; this is its plural |
| column 3 | **`Ordered`** | **NEW.** The quantity we asked the factory for |
| column 4 | **`Received`** | already ruled — the Receiving Workspace words |
| column 5 | **`Outstanding`** | already ruled — **and its own rule binds here: it is PRINTED, never left as `19 − 0` for the reader to subtract** |
| the last row | **`Total`** | **NEW** |

**Part of this card is a docs edit, not an afterthought:** add `Report` · `POs` · `Ordered` ·
`Total` to `docs/COPY-STANDARD.md` under the Purchasing section, so the next chat finds them
where every other word lives. A word ruled in a card and nowhere else is a word the dictionary
does not have.

### ✅ SHIPPED — what actually landed (2026-08-04)

PR **#593** (`6f6250a1`) + PR **#596** (the production fix below). **No migration.** A new
page, a new api route, one tab, and the four new words written into `docs/COPY-STANDARD.md`.
`OperationPurchaseOrders.tsx` and `po-workspace.ts` — Q1's files — are untouched.

**The computation is ONE pure module** (`packages/shared/src/po-report.ts`) and it stores
nothing: no table, no RPC, no cached figure. `GET /api/operation/pos/report` hands over one
flat purchase-order LINE per row, read off the same `purchase_order_lines` the register reads.
**Q4 imports this rather than counting again** — that is the whole reason it is in `shared`.

**NO MONEY, and it is STRUCTURAL rather than remembered.** There is no cost field on the wire
and none on `PoReportLine`, so nothing downstream can print one by accident — 0307's discipline
applied to a read. Asserted from both ends: the api body is scanned for
`cost|price|total|currency|amount|RM|MYR`, and so is the rendered page.

**THE TOTAL'S `POs` IS A DISTINCT COUNT, NEVER THE SUM OF THE GROUPS.** One purchase order may
carry two categories, and summing would report it twice. Today none does (July 5+1+1 = 7
distinct · August 8+3+3 = 14 distinct), which is exactly why the rule had to be written into
the arithmetic rather than left to agree by accident.

**PRODUCTION VERIFICATION, in a real browser at 1280×720 on `erp.carresofficial.com`.** The
August figures read off the live screen are the card's own SQL, re-run the same day:

```
Sofa        8   11   0   11
Bedframe    3    4   0    4
Mattress    3    4   0    4
Total      14   19   0   19
```

Measured on the same page: rail **200px** · table **934px and it does not scroll sideways** ·
rows **40px** · the page itself does not scroll · header widths Category **346** ·
POs/Ordered/Received/Outstanding **140** each.

**THE VERIFICATION FOUND A DEFECT AND THAT IS WHY IT IS DONE IN A BROWSER.** With August
picked, every rail `All` row printed `14` — the report's FILTERED total — so the month rail
said *all months hold 14 purchase orders*, and 21 of them do. **An `All` row must print the
number its own click produces**: that group's filter cleared, every other group's kept. The
facet shape became `{ all, options }` and each `all` is computed that way. Found on production
before anybody read it as a business figure; fixed, tested, and guarded in both suites.

**Five negative controls, each run as a REAL edit** (the P11 lesson — a `perl -0pi` edit can
silently decline on CRLF and leave a green run proving nothing; one of these fixes did exactly
that and was redone with a real edit):

| Control | Fires |
|---|---|
| remove the cancelled-purchase-order exclusion | shared **3** · web **1** |
| make the Total the SUM of the group counts | shared **1** |
| make the door ignore the filters | shared **1** · web **3** |
| put a `cost` field on the api payload | api **1** |
| point a rail's `All` back at the filtered total | web **1** |

**Gates.** web tsc **0** · api tsc **0** · shared **2088/2088** · api **3 pre-existing**
(`supplier/pos` ×2 · `partner/pickups` ×1) · web **16 pre-existing** (the documented four
files) · new: shared **21** · api **8** · page **16**. **check-design 8368, category for
category IDENTICAL to `origin/main`** — proved by linting BOTH trees (detached `origin/main`,
then the branch), never by quoting a delta.

**Reported, NOT built — five, and each names why:**

1. **The door lands on the PO, not on a filtered register.** The card says a click lands on the
   register with `month × category` already applied. The register has no URL filter but `?po=`,
   and giving it one means editing `OperationPurchaseOrders.tsx` — **Q1's file, which this card
   was told not to touch.** So the deeper rule is what shipped: the row unfolds IN PLACE into
   exactly the purchase orders its own count was made of, each a link into the register at that
   document. *"A number its own click cannot produce is the first count in this portal that
   lies"* still holds. The register-filter half is one param on that file once Q1 is free.
2. **No `group by` control.** Its two axes (`Category` · `Supplier`) are both already rail
   filters, and the CONTROL itself needs a word — `Group by` — that no dictionary has. Nothing
   was invented; grouping is by category, and the sort is most-ordered-first as a DEFAULT
   rather than a control, for the same reason.
3. **No `Status` facet.** COPY-STANDARD's facet-heading table bans a `Status` heading **by
   name** (*"status is the pill on the row, and a facet filtering by it would compete with the
   queue rows"*), and measured 2026-08-04 all 21 live purchase orders sit in ONE state — so the
   group could narrow nothing even if the word existed.
4. **`Month` has no COPY-STANDARD row.** It is reused verbatim from the portal's own live
   screens (HR's commission-run column, Finance's month picker) rather than invented — P3 met
   this exact square with `Note (optional)` and made the same call. It is written into the
   dictionary edit as a reported gap, not smuggled in as a ruling.
5. **The rail renders through `workspace-rail`'s `RailGroup`/`RailItem`** — Receiving's own
   recipe, which obeys the 2026-08-03 grey-hover law. **To Order still draws a THIRD
   implementation of the same row (`NavRow`, blue-hover)**; that is a pre-existing finding and
   not this card's to sweep.

---

## Q4 · Purchasing gets its dashboard

**Lane: PURCHASE ORDERS. STARTS ONLY AFTER Q3 MERGES.**

> **⛔ BLOCKED ON Q3, and the reason is structural, not scheduling.** A dashboard tile is a
> report figure made large. If Q4 computes its own counts, the same number is computed twice
> and the two WILL disagree — that is the disease this repository keeps paying for
> (`ops_order_control.balance`, and C5's one figure read three ways). **Q4 imports Q3's
> computation. It writes no arithmetic of its own.**

### Why

Loo, 2026-08-04: *"every department should have one dashboard and control all these right?
what is international advise?"*

**The international answer is: yes, with one condition.** SAP Fiori gives each role an
Overview Page; NetSuite gives each role a portlet dashboard. Odoo and Linear deliberately do
not — they put the statistics inside the list instead. **AutoCount has no dashboard at all,
and neither does 2990s for purchasing** (measured: their one `Dashboard.tsx` shows sales
counts only).

**The condition every one of the ones that works shares: each tile must be clickable and must
land on exactly the rows it counted.** A tile that only prints a number is decoration, and
decoration stops being read within a quarter.

**Carres already has something AutoCount and 2990s do not** — the action engine. The
purchasing dashboard is not new intelligence; it is `poCurrentActionOf` and `poArrivalGapOf`
counted and made large.

### Build

Four tiles, each a count of something the engine ALREADY computes, each a door:

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│      2       │ │      16      │ │      10      │ │      21      │
│ arriving     │ │ waiting for  │ │ landing late │ │ purchase     │
│ after the    │ │ a supplier   │ │ or on the    │ │ orders open  │
│ customer ⚠   │ │ date         │ │ day          │ │              │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       └────────────────┴── each opens the register, filtered ──┘
```

- Every tile reads Q3's computation or the existing shared engine. **No new arithmetic.**
- A tile at zero still renders. On this page a zero is an answer — *watched and fine* — and a
  tile that disappears makes the row's shape move under the operator.
- Red only where the engine already calls it late. **A number is not a status until somebody
  sets a target** (COPY-STANDARD) — do not paint a threshold nobody has ruled.

### DONE WHEN

- The tiles' numbers equal the register's own counts for the same filter, on production, on
  the day you ship. **If any tile disagrees with the register by one, the card is not done** —
  that disagreement is the whole thing this card exists to avoid.
- Every tile click lands on the register with the matching filter applied.
- Negative control: point one tile at its own private count instead of the shared one → a
  test fails. Quote it.

### MUST NOT

❌ compute any figure this page does not already compute elsewhere · ❌ add a KPI to the
shell header (`docs/03-page-patterns.md` — the five slots; a KPI in the header is a defect,
not a variant) · ❌ invent a word · ❌ start before Q3 merges.

## Q5 · The expand becomes the working area, and the right panel becomes Activity

**Lane: PURCHASE ORDERS · `OperationPurchaseOrders.tsx` + ONE new api route.
NO migration — every write door already exists in production.**

> **THIS CARD ABSORBS Q2.** Q2 was *"the ready date has somewhere to land"*; that landing
> place is now this expand, so building them apart would build the same field twice.
> **Q2 is closed by Q5, not skipped.**
>
> **Build it and ship it. Do not open a design round.** CLAUDE.md **§13.2 · The UI Evolution
> Rule** (Loo, 2026-08-04) governs this card: the business is settled, so the UI goes on
> screen and is judged in production, not in chat. *"Never keep a feature in discussion for
> days when it can be evaluated in production within hours."*

### ALREADY EXISTS — never rebuild

| | |
|---|---|
| **row expand** | `DataTable`'s `expand` — `expanded: Set<string>` + `expandable(row)`; its own comment: *"the expanded cell is the ONE cell in this table that may be taller than 40px"*. **D0.5d, shipped 2026-08-04** |
| **destination write** | `purchasing_set_line_destination` RPC **+ `POST /api/operation/pos/lines/:lineId/destination`** — both live |
| **line remark write** | `purchasing_set_line_ops_remark` + `POST /lines/:lineId/ops-remark` — both live |
| **expected arrival write** | `purchasing_record_tomorrow_delivery` + `POST /:id/tomorrow-delivery` — both live |
| **ready date write** | `purchasing_record_ready_date` (migration **0318**, gated, audited, ledger-writing) — **RPC live, NO ROUTE. This is the one thing to add.** |
| **the inline-edit manner** | Jess, 2026-08-02: a value is TEXT until clicked, then a control; **Enter saves, Esc cancels, no Save button anywhere** |

### Why — Loo, 2026-08-04

His diagnosis after using the page: **`Right panel not friendly to edit detail.`** The panel's
JOB was defined wrong, not the editing. It had become everything at once — edit · timeline ·
notes · communication · print.

**The split that fixes it:** DOCUMENT DATA (the PO) goes in the middle where the operator
types into it, exactly as AutoCount feels; ACTIVITY (what happened around the PO) stays on
the right. Full reasoning + the three-tier allocation:
`docs/PURCHASING-INFORMATION-MODEL.md` §12.7.5.

### Build

```
▼ PO-2032   Ohana   SO-1211   Booqit 1B +2   Carres Klang +1   17 Aug   25 Aug ⚠8d   Waiting
  ┌────────────────────────────────────────────────────────────────────────────────────┐
  │  Supplier Ready Date   [ ─ ]              Expected Arrival   [ 25 Aug 26 ]          │
  │  ──────────────────────────────────────────────────────────────────────────────────│
  │  SO-1211   Booqit 1B(LHF)   1   [ AL Sungai Buloh ▾ ]   0 / 1                       │
  │  SO-1211   Booqit 2A(RHF)   1   [ Carres Klang ▾    ]   0 / 1                       │
  │  SO-1211   Booqit CNR       1   [ Carres Klang ▾    ]   0 / 1                       │
  └────────────────────────────────────────────────────────────────────────────────────┘
▶ PO-2031  …
```

1. **ONE PO expands at a time.** Opening a second closes the first — the expand holds live
   controls and three open at once is a page with no focus.
2. **Editable in the expand:** per-line `Destination` (existing route) · `Supplier Ready Date`
   (**new route**) · `Expected Arrival` (existing route).
3. **Read-only in the expand:** SO No. · item · qty · received. See the refusal below.
4. **`POST /api/operation/pos/:id/ready-date`** — built exactly like `/:id/tomorrow-delivery`
   directly above it: a zod input in `packages/shared/src/schemas/operation.ts`, `userClient`
   + the JWT (**never `service_role`** — the RPC's own gate is the boundary), and the same
   `mapSupplierCallError` so `po_not_open` returns a readable 422 rather than a raw constraint.
5. **`poDateHistoryOf` learns the second kind.** It filters `kind === 'tomorrow_delivery'`
   today, so the first ready date recorded would be **silently swallowed by the history**.
   Show both and say which is which.
6. **The date door LEAVES the right panel.** One editing surface, or the two disagree. The
   panel keeps Communication · Timeline · Print and stops carrying the date row.

### ONE THING THE CARD REFUSES TO BUILD, and it is a frozen business rule, not a preference

**Qty is NOT editable.** Loo's sketch has `Qty [Input]`, and
`docs/PURCHASING-WORKING-FLOW.md` §3 rules: *"Items are ADDED to a sent PO by raising a NEW
PO, never by editing the old one"* — the supplier holds that document exactly as they received
it. **There is also no door**: migration 0316 made PO-line quantities RPC-only and no
`set_line_qty` RPC exists, deliberately.

**Building a Qty input would need a migration AND a reversal of a frozen rule.** Qty renders
as text. **Report it; do not build it, and do not ask Loo to re-rule it inside this card** —
if he wants it, it is its own card with its own business decision.

### DONE WHEN — verify on production, with your eyes, and say the PO number

- **`PO-2032`** — the only live PO with two destinations — expands and shows its 3 lines with
  `AL Sungai Buloh` on line 1 and `Carres Klang` on lines 2-3. **Change one, reload, it stuck.**
- A **Supplier Ready Date** recorded through the expand on a real open PO moves
  `expected_ready_date`, writes a `kind='ready_date'` promise row, writes a `po_history`
  sentence, **and appears in the date history labelled as a ready date.**
- Opening a second PO closes the first — asserted by a test.
- The right panel no longer carries a date door; Communication, Timeline and Print are intact.
- `Esc` restores and posts nothing; there is no Save button anywhere in the expand.
- Negative controls, each quoted with its failure count: remove the one-at-a-time guard ·
  remove the `ready_date` branch from `poDateHistoryOf` · point the new route at the wrong RPC.

### THE KIT POWERS THIS PAGE HAS NEVER WIRED — and Loo ruled each one, 2026-08-04

Measured: `OperationPurchaseOrders.tsx` passes **none** of D0.5d's four props. That list is
not the plan — **CLAUDE.md §13.3** applies, and he answered it feature by feature:

| Power | | Why |
|---|---|---|
| **Expand row** | ✅ **wire** | line-level facts compared across many POs without opening each. This card's whole point |
| **Resize column** | ✅ **wire** | supplier names are different lengths; one width cannot suit them all |
| **Reorder column** | ✅ **wire** | different operators watch different columns |
| **Footer totals** | ⚠️ **do NOT wire** until somebody names what an operator would DO with the number. Being already built is not a reason | |
| **Group rows** | ⚠️ **do NOT wire.** This register groups by nothing today; grouping for the sake of grouping is the failure §13.3 names | |

**REFUSED, and this is a ruling not an omission** (Loo, 2026-08-04): **row height stays 40px.**
Do not shrink it to AutoCount's ~28px. *"Carres is queue → list → detail with constant review
and communication — GitHub / Linear / Shopify Admin, not Excel."* Also refused: Excel-style
right-click header menus, and per-operator layout memory (**§0.4 — a grid's shape is the
company's; he ruled it the same day**).

**The card's brief is `Bring AutoCount's productivity into Carres`, never
`Make Carres look like AutoCount`.**

### MUST NOT

❌ write a migration · ❌ make Qty editable · ❌ leave a second editing surface in the panel ·
❌ nest an expandable inside an expanded row · ❌ change the 40px row height or any other token ·
❌ wire footer totals or grouping · ❌ add per-operator layout memory · ❌ invent a word —
`Supplier Ready Date` · `Expected Arrival` · `Received At` · `Customer Delivery` are ruled in
`PURCHASING-INFORMATION-MODEL.md` §12.2, and everything else is already in COPY-STANDARD ·
❌ touch `OperationToOrder.tsx` · ❌ use `service_role` · ❌ hold the card for a design round.

### ✅ SHIPPED — what actually landed (2026-08-04, PR #600 `f2517f99`)

**No migration.** Web + api + `packages/shared`. Web `index-D0zk6wtt.js` (carres-portal
`e2033670` + carres-pos `4c729b59`) + Worker `3b87b0ab` — DEPLOYED, four canonicals, live
file md5-identical to the local build, `SERVICE_ROLE` 0.

**The split, built as §12.7.5 rules it.** The EXPAND carries the document: the two dates
(`Supplier Ready Date` · `Expected Arrival`, both editable) and one line per SO × SKU with
which SO, which item, qty, **its own destination** (editable), its ops remark and `Received`.
The RIGHT PANEL carries identity + `Document` / `Communication` / `Communication History`.

**THE PANEL LOSES THREE THINGS AND NOTHING IS DUPLICATED.** Its date row, its items grid and
its per-line `⋮` are gone — not copied. Rule 1 (nothing appears in two tiers) and rule 3 (ONE
editing surface) are the same repair here, and the card's own MUST NOT (*"leave a second
editing surface in the panel"*) is what made the deletion mandatory rather than optional.

**ONE PO expands at a time is a PROPERTY, not a rule that runs.** The state is a single id,
so two open rows cannot be represented. The test that says so was proved non-vacuous by TWO
controls: turning the state into a Set fires it, and removing the close-on-re-click fires the
other one.

**The one genuinely new thing is the route, and the door had been half-built for a day.**
`purchasing_record_ready_date` shipped with **0318 on 2026-08-03 and nothing ever called it**,
so `Confirm ready date` — an action `PURCHASING-WORKING-FLOW.md` §3 has carried since it was
written — **had no button anywhere in the portal**. `POST /:id/ready-date` is the twin of
`/tomorrow-delivery` directly above it: `userClient` + the operator's own JWT, never
`service_role` (the RPC's own `purchasing_supplier_call_gate()` IS the boundary), and the same
`mapSupplierCallError`, so `po_not_open` comes back as a readable 422.

**`poDateHistoryOf` learns the second kind, and the bug it closes was one day old.** It
filtered `kind='tomorrow_delivery'`, so **the first ready date an operator recorded would have
been swallowed by the history sitting beside the field.** The two runs are numbered separately
and each is NAMED on screen: they are different FACTS (§12.2 ① vs ②), every supplier here
carries transit days, and a slip measured between a ready date and an arrival date is a number
about nothing.

**MEASURED IN A REAL BROWSER, AND IT CHANGED THE DESIGN.** With the select, the `Move` field
and the two controls all inside the 160px Destination cell, the cluster came out **68px tall
at the compact listing width (680px)** — three wrapped lines, pushing the row to 81px. The
editing controls moved to their own full-width strip under the row: **39px, one line**, row
45px, no horizontal overflow, and the two date fields sit on ONE 25px row at both 680px and
1080px. **jsdom has no widths, so no page test could have caught it.**

**A DEPARTURE FROM THIS CARD, REPORTED RATHER THAN APPLIED.** Its Done-when says *"there is no
Save button anywhere in the expand"*. Two of the three fields are MULTI-field forms that Jess
gave Save buttons **after using them** — *"i cant save?"* (the arrival form) and *"i cant save
for AL"* (the destination picker: a picker changed with the MOUSE has no keyboard gesture to
commit). Removing them re-breaks exactly what she reported. So: the ONE new single-value field
(`Supplier Ready Date`) takes the ruled manner exactly — Enter saves, Esc cancels, no button —
the two older doors keep hers, and the split's control is named `Split`, which is an act rather
than a save. **Esc restores and posts nothing everywhere, which is the half that did hold.**

**Verified against PRODUCTION on PO-2032** — the card's own PO: 3 lines, `AL Sungai Buloh` on
line 1 and the PO's `Carres Klang` followed by lines 2-3, 0 received (so nothing is frozen).
Six assertions inside a **rolled-back** transaction: the ready date moved
`expected_ready_date` to 12 Aug, wrote exactly ONE `kind='ready_date'` promise, wrote the
`po_history` sentence (`Supplier ready date - -> 2026-08-12`), left `eta_date` alone, and the
destination door moved line 2 to AL — then the **rollback was proved total** and
`expected_ready_date` still has exactly ONE writer in the whole database. Nothing invented was
left on a live purchase order.

**Live effect today: measured — 0 of 21 POs carry a ready date**, because until this deploy
nothing in the portal could record one.

**Two things fixed on the way, both one word in a SELECT.** The promises read never selected
`about_qty` (so the balance call's re-open comparison, which this route's file computes, saw
null on every row) or `remarks` (so the ledger's free text could not print beside its
countable reason).

**Reported, not fixed (Law 0):**

1. **The last line of this card's own Done-when needs Loo's login.** *"Open PO-2032, expand
   it, change a destination, reload, it stuck."* A password may not be typed by a chat, so the
   click-and-reload on the deployed page is his; the two doors were proved at the database
   instead, and the deployed bundle was proved to carry the working area in both directions.
2. **`Goods Arrival` still heads the register column while the expand below it says
   `Expected Arrival` for the same fact.** §12.2 retires the former **and names this page's
   column by name** — but the rename moves a header width Q1 measured in a browser (96px
   compact / 192px expanded), so it is named here rather than slipped into a card about the
   expand. It is one word and one re-measurement.
3. **`Received At` (§12.2 ③) has no field on the wire and none was invented.** The model
   already says why: 0 `warehouse_receipts` rows have ever existed, so the register can say
   how many arrived and never when.
4. **The destination shows on EVERY row of a multi-SO line, because it belongs to the LINE.**
   Line a1 of a merged PO appears as two SO rows and both print the same picker; editing either
   edits the line. That is the truth of the data until P5's allocation, and the split
   arithmetic deliberately reads the LINE's remainder, never the row's slice.
5. **The expand control's column is the kit's 3%**, so at the compact listing width it is
   ~20px against a 24px control — P10 measured the same thing on To Order. Nothing clips and
   the `auto` tail absorbs it; the kit owns that number, not this page.
6. **`check-design` 8368, unchanged in total**, but not category-for-category: `E` +2 · `G` +1
   · `I` −3 against the tree without this change. The `G` is the native `<input type="date">`
   the kit's `DatePicker` would replace — the sibling field already uses one, and migrating
   this page to the kit is D6/D7.


---

## Q6 · To Order is audited against the same architecture

**Lane: PURCHASING · `OperationToOrder.tsx`. NO migration. STARTS AFTER P13 MERGES** — P13
(`claude/p13-take-words`) holds that file today.

> **Loo, 2026-08-04: *"now to order page i want also follow us."*** This card is the audit
> that makes that true — **and it is deliberately small, because the honest measurement is
> that To Order is already closer to the architecture than Purchase Orders was.**

### ALREADY TRUE — measured 2026-08-04, do not rebuild

| | |
|---|---|
| the kit's row **expand** | live since P10, and its own comment says *"the kit's own row expand (D0.5d), not a second one"* — `expandable: (r) => r.freeStock > 0 && !poOf(r)`. §13.3 is already satisfied here: the control appears only where it has something to open |
| the kit's **group** | live — `SO-1209 · Steven · Wed, 26 Aug 26` |
| **priority row order** | the rail is `Overdue` first, then the PO-day buckets. That IS operator priority, which is what Q1 had to fix on Purchase Orders |
| **no right panel** | To Order is a **Workspace** (`docs/03-page-patterns.md`), not a document register. The Row / Expand / Right-Panel split does NOT map onto it, and inventing a panel here would be copying a shape rather than solving a problem |

### What this card actually does

1. **Apply CLAUDE.md §13.3 to the two unwired powers, and answer the question rather than
   the list.** `resize` and `reorder` are not wired. For EACH one, either wire it or write
   down why an operator is no faster with it. **Both answers are acceptable; silence is not.**
2. **Check every visible date word against the frozen dictionary**
   (`PURCHASING-INFORMATION-MODEL.md` §12.2): `Supplier Ready Date` · `Expected Arrival` ·
   `Received At` · `Customer Delivery`. The dictionary is **portal-wide** — a page showing
   one of those four facts under any other word is the defect it was written to stop. The
   group header's bare date is the customer's date; if it is ever labelled, that is its word.
3. **Report anything on this page that the Purchase Orders architecture would have caught**
   — a status wearing an action's clothes, a fact stated in two places, a control that writes
   from two surfaces. **Report it into P7's card. Do not fix it here.**

### DONE WHEN

- `resize` and `reorder` are each either wired or refused **in writing, with the operator
  reason** — quoted in the PR.
- A source scan proves no retired date word (`Goods Arrival` · `Stock ETA`) is on this page,
  and the result is quoted.
- Nothing else on the page changed. **This is an audit, not a redesign** — P7 owns the
  redesign.

### MUST NOT

❌ change the row height or any token · ❌ add a right panel · ❌ wire a power without
answering §13.3's question · ❌ touch the P8-P13 features · ❌ start before P13 merges ·
❌ do P7's rewrite.

## Status

| Card | Status | PR |
|---|---|---|
| P1 | ✅ the numbers become settings (migration **0303**) | #488 |
| P2 | ✅ the interaction law is true on **To Order** (#492) · **Claims** (#494) · **Receiving** (#495). Purchase Orders is a nested route with no rail and was never in scope | #492 · #494 · #495 |
| P3 | ✅ the two missing supplier calls (migration **0306**) — and a balance date enters Delay planning too (Loo, 2026-07-29) | #506 |
| P4 | ✅ where the goods go — migration **0307 applied, verified and merged** 2026-07-29 · **P4 FROZEN**; the application-code half is NOT P4 and starts as its own execution card (§10) | #513 |
| P5 | ⬜ after P1-P4 · prove it with a real PO | — |
| P6 | ✅ **Purchasing terminology freeze** (2026-07-29), **partly superseded 2026-07-30 by the Purchasing clean restart**: `Draft PO` is permanently removed, raising a PO is ONE act (`Issue PO`), Operation Status is FIVE labels, and the verb dictionary went 6 → 7 (`Prepare`) and back to 6. Docs only | — |
| P8 | ✅ **a typed purchase demand can actually be saved** (migration **0320 applied**) — and **the create half was already shipped by #581/0319 when the card was written**, so it was verified, not rebuilt. What was missing was the card's ONE ADDITION: `issued_qty` (writable only through a door) + `remaining_qty` (**GENERATED**, so it cannot disagree), and *"still to buy"* stops meaning *"has no purchase order"*. The issue path stops PATCHing and **adds** what it took, refusing an over-issue by name. 8 assertions on prod, rolled back; applied function byte-identical to the file. **Reported, not fixed: a ready-stock demand for a SOFA projects as 1** whatever quantity was typed — ruled a DEFECT rather than the business question this row first called it, and **CLOSED by P11** (#589), which also found it was credited as 1 while the purchase order ordered the full quantity — and **nobody can cancel a demand** (RPC exists, no route, no button — a route with no caller is C1's bypass) | #584 |
| P9 | ✅ **the page says how many of each you are buying** (Loo 2026-08-04) — **no migration, web only**. CATEGORY rows carry bare UNIT counts; the PO Schedule above them keeps counting ORDERS, and the two are told apart by their own tooltips (`12 Orders` · `19 units`, COPY-STANDARD's own pair — no word invented). The rail counts UNISSUED work and **cascades over every narrowing except the category picks**, so the number a row shows is the number of units its click produces. The footer totals what is TICKED, per category, accumulated **inside the loop that decides what Issue acts on** — the VIEW-SCOPED law holds by construction, not by two counts agreeing. **Measured in a real browser on live data (1280×720)**: rail `All 20 · Mattress 15 · Bedframe 4 · Sofa 1 · Pillow 0 · Mattress Protector 0`, each equal to the grid's own Qty sum (mattress = 10 rows, 15 units — the two are not the same number); footer `Mattress 15 · Bedframe 4 · Sofa 1` beside `15 selected · Issue 3 POs`. **The card said "footer, beside the Issue button" and those are two places, so the widths were measured**: the line costs 257px and the toolbar has 223px spare at 1280 (607px at 1920) — a line that fits on a manager's monitor and breaks on an operator's laptop is not a placement, so it went to the footer band (573px spare). **Reported, not fixed**: Loo's 2026-08-03 footer ban was on the customer ORDER count, so the old blanket `no digits` test is NARROWED to `/d+s*(orders?|SO)/` rather than deleted · the design-standard scanner reads `PR #494` in a comment as a hex colour · the rail excludes an order with no delivery date, exactly as the grid does · a flat per-SKU SQL says 3 sofa units where the engine's per-BUILD allocation says 1, and the engine is the authority | #585 |
| P11 | ✅ **a sofa with no modules carries its own quantity** — **no migration, shared engine only; no Pages deploy owed and it is proved by CHECKSUM** (the web never imports `buildToOrder`, so a build from this tip emits `index-DiTy2SJk.js`, the bundle already live). The discriminator moved from the CATEGORY to the MODULES: a group of more than one line is a build and collapses to 1, a lone line carries its own quantity — and a group of more than one can only exist under a real build key, since a synthetic `line::` key is unique per line. **The row stopped being counted a second time**: it is `builds.reduce(+qty)` for every category, so the row and its builds agree by construction rather than by two counts agreeing (`builds.length` is gone). **The defect was wider than the display and that is the part the card did not name**: the api credits `purchasing_demand_record_issue` with the BUILD's qty while the purchase order is written from the LINE's — so a demand of 5 was ordered in full and recorded as 1, leaving 4 to be bought a second time. One fix closes all three. **Measured on prod**: 12 sofa groups — 9 genuine multi-module builds (still 1 each) and 3 lone lines, all qty 1, so **0 rows change today**. **Three negative controls, each fired as a real edit**: restore the `? 1` → exactly the 4 new shared tests · restore `builds.length` → 4 · the api sofa-demand test → 1, reading `expected 1 to be 5`. **A control that did not fire, and why**: the first api control was a `perl` in-place edit that CRLF silently declined, so the 45/45 that followed proved nothing — re-run as a real edit it fires. **The row-sum test also passed its own control at first** and was strengthened rather than kept: its fixture agreed with `builds.length` too, so it guarded nothing until a lone line of 2 was added to it | #589 |
| P12 | ✅ **SHIPPED 2026-08-04** (PR #598 `3245a59a`, migration **0321 applied**, web `index-mIdlwTf2.js` + Worker `59bdd682`) · **a demand can be cancelled — and so can the remainder of a part-ordered one** (door + button in ONE card — a route with no caller is a bypass). **After P10**, whose card owns the grid row. **UNBLOCKED 2026-08-04 — Loo ruled the remainder CAN be cancelled**; the 3 already ordered are the PO flow's problem, not this one's. Migration relaxes the `po_id` gate. **Cancel is not delete: no delete button ever** — test rubbish goes by SQL and the database starts clean at go-live | — |
| P13 | ✅ **SHIPPED 2026-08-04** (PR #599 `8ac7787f`, migration **0322 applied**, web `index-CT-nebMG.js` + Worker `b74c98f9`) · **the take path says what it means — one button word, one reason word** (Loo ruled BOTH 2026-08-04, ONE card). ① `Take` → **`Reserve`**, and the past tense with it (`took 2 from stock` → `reserved 2 from stock`) — the drawer has said `Reserve {n} to {soRef}` for the same act since 2026-06-30, and the goods do not leave. **BOTH directions are asserted**: the page renders no `Take`/`took`, and a source scan pins the drawer's four strings byte for byte, so harmonising the OLDER screen onto the newer one fires a test. The route path `/take-stock` stays — a wire contract, not a word. ② **K4 gains a sixth reason**, and the CHECK alone would have been a half-fix: the five-word list lives in FOUR places, and the shared constant feeds the zod enum guarding both routes and all three pickers — so 0322 widens the CHECK **and both RPC bodies**. **The sixth is APPENDED, so `other` is no longer last** — the Must-NOT forbids moving the five, and that array is the display order. **No backfill, and today trivially so: `ops_stock_pool_usage` holds ZERO rows on production**, so the live effect is none and what changes is that the first draw ever recorded names itself. **The negative control ran BEFORE the migration and fired** (the live pre-0322 CHECK refused the word); applied bodies reconcile byte-identical to the committed file. Five code controls, each a real edit, each fired — **one silently declined first because the file is CRLF**, the third time that trap has been paid for. **Reported, not fixed: neither word is in COPY-STANDARD** — nor were P10's three, nor K4's five | #599 |
| P10 | ✅ **ready stock is suggested, the human takes it** — **no migration**. The engine has computed it since the day it was written and it was switched off and shown to nobody; `consumeFreeStock` is still `false` and nothing nets it, because Jess's 2026-07-21 ruling stands — the defect was that a decision reserved for a human never reached the human. Loo's option B: D0.5d's inline row expand, the offer counted off the **register** (`ops_stock_items`, the table the draw moves) and what was already taken read off **K4's LEDGER** — not off `status='reserved'`, which would put a satisfied requirement back on the page the day the goods went out. `POST /take-stock` carries no quantity and goes through `ops_stock_pool_draw`, one call per record. **It was built TWICE the same day**; the parallel branch `claude/p10-ready-stock-4c0f8f` is preserved on origin and NOT merged, and its four independent measurements are recorded under the card: **the offer matches nothing on live data today** (the 87 free units are Klang-sheet descriptions, all 31 demand SKUs are catalog codes — zero overlap, correct, self-healing) · **`Take` here vs `Reserve {n} to {soRef}` in the drawer's picker, one act two words, Loo's to rule** · **the kit's 3% expand column is narrower than its own 24px control below ~1440px** (3px onto the checkbox at 1024; nothing clips, no sideways scroll, rows still 40px) · **the offer does not filter CONDITION**, so a released `damaged` unit would be offered to a customer (zero exposure today, measured) | #591 |
| **Q1** | ✅ **the register puts the most dangerous PO first** (Loo 2026-08-04) — **no migration, no api change, no Worker deploy** (`apps/api` imports nothing from `po-workspace`, measured). `comparePoRisk` lives in `packages/shared`, never in the page: a page-local comparator would be a SECOND priority, and the row's pill would say one thing while its position said another. **Jess's `PO Issued` law is overridden as the DEFAULT and is NOT deleted** — it keeps its column, its header sort, and it is the tie-breaker; a test asserts that clearing a header sort returns to RISK order. `Current Action` 200px fixed and `Items` becomes the `auto` tail — **the recipe is unchanged, only which column absorbs the slack**, and the argument is that the column which truncates should be the one whose truncation costs least. **Widths measured in a real browser and the measurement reproduced the card's own four numbers exactly** (auto gave it 23px at 1280 · 109 at 1366 · 183 at 1440 · 663 at 1920, against words needing 109–201). **Reported, not hidden: the compact fixed sum moves 424 → 484, so the listing region's horizontal-scroll threshold moves from a 1257px viewport to a 1317px one** — at 1280 the region gains 37px of scroll where today it has none and a 23px instruction column; the region already answers "the columns do not fit" that way by its own design, and a readable instruction beats a deleted one, so 200 shipped as ruled with the number on the record. A gap from OUR estimate is amber, a gap the factory gave stays red, `same day` amber either way — **no new word, only the tone**, and the workspace reads the same rule. **Verified against production data before the deploy**: 10 of 21 rows warn and 8 of the 10 are our own estimate · **`PO-2038` is row 1** with an amber `7d late` (it was row 8) · `PO-2031` and `PO-2032` are the only two reds, both `8d late` · **zero open engine calls exist today**, so rungs 1 and 4 are empty on live data. Four negative controls, each run as a real edit and each verified to have applied: rung 1 → shared 2 + web 3 · register tone → 1 · workspace tone → 1 · `auto` → 2. **`data-tone` is NOT a clean bundle marker** — it greps 2 in BOTH bundles (the journey-health strip and the order-action row already used it); the clean one is `"confirmed":"estimate"`, 0 → 2 | #590 |
| ~~Q2~~ | ➡️ **ABSORBED BY Q5, 2026-08-04 — closed, not skipped.** Q2 was *the ready date has somewhere to land*; Loo then ruled that landing place is the row EXPAND, so building them apart would build the same field twice. The one thing Q2 uniquely owned — the missing `POST /:id/ready-date` route over the live 0318 RPC — is now step 4 of Q5 | — |
| **Q3** | ✅ **Purchasing gets its Report tab** (Loo 2026-08-04) — **no migration; a new page, a new api route, one tab, and the four new words written into COPY-STANDARD.** It stores nothing and computes at read time; **NO MONEY, structurally** — there is no cost field on the wire, so the page could not print one (asserted from both ends). **The Total's `POs` is a DISTINCT count, never the sum of the groups** — one purchase order may carry two categories, and today none does, which is exactly why the rule is in the arithmetic rather than left to agree by accident. **Verified on production in a real browser**: August reads `Sofa 8/11 · Bedframe 3/4 · Mattress 3/4 · Total 14/19`, the card's own SQL re-run the same day; rail 200px, table 934px with no sideways scroll, rows 40px. **The browser check found a defect and that is the point of doing it there**: every rail `All` row printed the FILTERED total, so with August picked the month rail said *all months hold 14* when 21 do — an `All` row now prints the number its own click produces. **check-design 8368, identical category for category to `origin/main`**, proved by linting both trees. **Reported not built**: the door lands on the PO rather than a filtered register (that needs a param on Q1's file) · no `group by` and no `Status` facet — both need words no dictionary has, and `Status` is banned as a facet heading by name · `Month` is reused from HR/Finance and has no dictionary row · To Order still draws a third copy of the rail row | #593 · #596 |
| | ⚠️ **OPEN QUESTION on Q3, raised 2026-08-04 and NOT acted on:** Loo said `q3 — 删掉` in the same message that rejected the summary band. **The tab was already built and live when he said it.** His stated reason — *a List page processes work, a Dashboard monitors* — is an argument AGAINST a band on the register and reads as an argument FOR keeping KPIs in their own tab, so the instruction and its reason point opposite ways. **Nothing was deleted. A shipped, deployed tab is not removed on an inferred reading.** Put to him; his answer goes here | |
| **Q1b** | 🔴 **BLOCKED ON THE MODEL** — Q1 made the row ORDER correct and left it INVISIBLE: the register default view hides `Customer Delivery` and `Expected Arrival`, so 21 rows read alike and nothing says why row 1 is row 1 (Loo caught it live 2026-08-04, from his own screenshot). **A summary band was proposed by me and REJECTED by him**, on the stronger principle: *a List page processes work, a Dashboard monitors* — a Summary on every page puts one number in four places. Three ROW-LEVEL candidates were studied against SAP Fiori · Dynamics · Linear · GitHub · Jira and **none is chosen**: the left-edge bar (**`rowLate` already exists in the kit** — Loo added it 2026-08-03 for this identical problem and this page has never passed it) · an in-cell badge · its own column. **His own candidate `整行轻微背景强调` is REFUSED by law**: `01-design-tokens.md` §2.3 spends row background on hover (grey) and selection (blue). **Waits on `PURCHASING-INFORMATION-MODEL.md` §12.5** | — |
| **Q4** | 🔴 **BLOCKED ON THE MODEL** — Q3 shipped, so the arithmetic exists; but a dashboard is the second place a number lives, and §12 has just re-opened what the register itself should show. Do not start until §12.5 closes | — |
| **Q5** | ✅ **the expand becomes the WORKING AREA, the right panel becomes ACTIVITY** (Loo 2026-08-04, after using the page: *"Right panel not friendly to edit detail"*) — **no migration**; web + api + shared. DOCUMENT DATA moved to the row expand where the operator types into it; ACTIVITY stayed right, and **the panel lost its date door, its items grid and its per-line ⋮ rather than keeping copies** — rule 1 (nothing in two tiers) and rule 3 (one editing surface) are the same repair. **ONE PO expands at a time is a PROPERTY**: the state is a single id, so two open rows cannot be represented — proved non-vacuous by a Set control AND a no-close control, each firing 1. **The one genuinely new thing is the route the card names, and that door had been half-built for a day**: `purchasing_record_ready_date` shipped with **0318 on 2026-08-03 and nothing ever called it**, so `Confirm ready date` had no button anywhere in the portal. **`poDateHistoryOf` also filtered the ready kind OUT**, so the first ready date an operator recorded would have been swallowed by the history sitting beside the field — two runs now, numbered separately and each NAMED, never merged (different facts, and every supplier here carries transit days). **Qty stays read-only, asserted from both ends** (no number input on the page; a route test refuses a quantity smuggled through the body). **Measured in a real browser and it CHANGED the design**: the select + `Move` + the two controls inside the 160px Destination cell came out **68px tall at the 680px compact width** — three wrapped lines — so the editing controls took their own full-width strip (**39px**, one line). **Verified on production against PO-2032 in a rolled-back transaction**: the ready date moved `expected_ready_date`, wrote exactly ONE `kind='ready_date'` promise and the `po_history` sentence, left `eta_date` alone, and the destination door moved line 2 to AL; the rollback was proved total, and **0 of 21 POs carry a ready date today** because nothing could record one. **Reported, not applied — the card asks for no Save button anywhere in the expand and TWO of the three fields are multi-field forms Jess gave Save buttons AFTER using them** (*"i cant save?"* · *"i cant save for AL"*): the new single-value field takes the ruled manner exactly (Enter saves, Esc cancels, no button), the two older doors keep hers, and the split's control is named `Split`, which is an act rather than a save. Also reported: the register column still says `Goods Arrival` beside an expand that says `Expected Arrival` for the same fact (§12.2 retires it and names this column, but the rename moves a header width Q1 measured); `Received At` has no field on the wire, exactly as §12.2 says; and **the last line of the Done-when needs Loo's own login** — a chat may not type a password, so the click-and-reload on the deployed page is his | #600 |
| **Q6** | ⬜ **To Order audited against the same architecture** (Loo 2026-08-04: *"now to order page i want also follow us"*) — **deliberately SMALL, because the measurement is that To Order is already closer to it than Purchase Orders was**: the kit expand (P10), `group`, and a priority-ordered rail are all live, and it has no right panel to mis-define because it is a Workspace, not a document register. The card applies **CLAUDE.md §13.3** to the two unwired powers (`resize` · `reorder` — wire or refuse IN WRITING, silence is not an answer) and scans every visible date word against the portal-wide dictionary. **An audit, not a redesign — P7 owns the redesign. After P13 merges** | — |
| P7 | ⬜ **To Order becomes the Planning Workspace** — the frozen information architecture ([`docs/PURCHASING-INFORMATION-MODEL.md`](PURCHASING-INFORMATION-MODEL.md), 2026-07-29) made true on the tab. Carries seven measured gaps (G1-G7) incl. two positives: demand silently discarded, and `Check in` moving out without losing the customer fact. **Eight terminology slots OPEN — no chat may fill one** | — |
