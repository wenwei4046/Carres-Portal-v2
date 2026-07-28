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
     long a factory takes.
- **Only TWO suppliers can be purchased from** (live 2026-07-28): Nice Future × mattress
  (42 SKUs) and Ohana × bedframe + sofa (154 SKUs) — **three supplier × category pairs.** The
  other 8 suppliers carry ZERO SKUs. The settings matrix is DERIVED from which supplier
  actually has SKUs in a category; a 10 × 3 grid of empty boxes is the wrong screen.
- **Zero purchase orders exist.** `purchase_orders` = 0 rows. Every P-card must prove its
  path works by creating a real PO, not by reading an existing one.
- **The live migration tail is AHEAD of the repo.** 2026-07-28: the tracker holds `0301` +
  `0302` (the ④ R6 warehouse-login line) and neither file is on main. Number from the
  TRACKER, never from `ls supabase/migrations`.
- **One warehouse exists**: `Carres Klang`. AL Sungai Buloh and HOUZS Balakong are not
  records anywhere.
- **`purchase_order_lines` already carries** `qty` · `received_qty` · `damaged_qty` ·
  `wrong_item_qty`. Partial receiving is already quantity-based. **`cancelled_qty` does not
  exist** — the one real gap in the state model (flow file §9).
- Claims are LIVE (R2 · R3 · R4, `supplier_claims`, migrations 0288/0291/0299) but Claims
  is **not yet a tab** — it becomes one in P2.
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
5. **Close all FOUR doors** (Ground truth above), not just the constants: delete the
   constants with NO fallback · retire `PurchaseSettingsSheet.tsx` and its gear icon · retire
   the two dead fields on Catalog → Delivery · stop `suppliers.lead_time` claiming to answer
   this question. A fallback is how a setting silently stops mattering; a second door is how
   a manager edits a number and nothing happens.
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

**FOUR doors closed** — the numbers had four homes and they disagreed:
- `PurchaseSettingsSheet.tsx`, the read-only gear on To Order, **deleted**. It showed
  PO days as **Mon + Thu** (four days after Jess moved to Mon/Wed/Fri) and promised the
  values would become editable "when the lead-time table ships". This is that table.
- `delivery_fee_config.mattress_bedframe_lead_days` / `sofa_lead_days` — **editable in
  Catalog → Delivery, saved on every click, and read by nothing.** The inputs are retired;
  the columns stay (nothing is dropped) with no writer.
- `suppliers.lead_time` — free text ("7-21 days"), empty on 8 of 10 suppliers, printed as
  a `Lead time` stat on the Suppliers card and appended to its drawer subtitle. **Both
  retired**; the column is untouched in the DB, it simply stops being shown as an answer.
- The constants themselves — **deleted, no fallback.**

**The sofa's third number was live code, not a stale comment.** The card says sofa read
10 in the engine and 5 "in a stale Orders comment"; the 5 was `PO_STOCK_LEAD_DAYS.sofa`,
driving the urgent bypass on the Orders list every day. It now reads the same production
working days as everything else.

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
Claims tab, the Receiving tab, the facet rail, the table.

**Build — the UI-KIT §8.2 interaction law**, written and implemented nowhere:
click a queue tile → the table filters · click it again / ✕ → it clears · two tiles → two
✕-able chips · click a row → the drawer opens on its FIRST tab · closing keeps the filter AND
the scroll position. Purchasing is the first module to implement it; **Orders already behaves
this way and is the reference — copy it, do not invent it.**

**No migration.**
**Done when:** every queue tile on Purchasing filters and clears, and nobody types a URL to
reach a claim.

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

## P4 · Where the goods go

**Goal:** a PO says where the supplier must send the goods, and prints it.

**Build:**
1. Locations: `Carres Klang` (our own) · `AL Sungai Buloh` · `HOUZS Balakong`. Only one
   exists in the database today.
2. The choice sits on the PO and appears on the printed PO.
3. **Nice Future is fixed** — it does not deliver: `collected by NETS → Carres Klang` is its
   only option, and the PO says so.
4. Default for everyone else is `Carres Klang`.

**Why it matters:** an outstation order can only be delivered by AL, and AL will not collect
in Klang. Sending the goods straight to AL saves a whole transfer.

**NOT in this card:** moving goods we already own (the Lalamove run that takes pillows and
mattress protectors from Klang to AL). That is a **stock transfer** and belongs to the Stock
line — putting it here would mix "buying" and "moving" in one place and neither would
reconcile.

**Migration:** yes — locations + the PO's destination. Draft to Jess first.
**Done when:** a printed PO tells the supplier exactly where to send the goods, and Nice
Future's PO can only say one thing.

## P5 · Prove it with a real PO

**Goal:** the whole line has never run. Take one real customer order from To Order through
Send PO → ready date → tomorrow's call → check in (part) → balance call → fully received,
and fix whatever breaks.

**This is a card, not a test plan.** Zero POs exist, so every earlier card is theory until
one goes end to end.

**Build / fix as found:**
1. `cancelled_qty` — the one gap in the state model (§9). A cancelled line silently makes
   `To order` wrong today.
2. The two gates that have no home yet: a PO cannot be sent twice for the same customer line
   and quantity; a check-in cannot be posted twice for the same supplier delivery order
   number.
3. Whoever is on a task shows on it (`Yu Jun is handling this · started 10:14`) — everybody
   can see everybody's work, so two people WILL open the same task.

**Migration:** likely. Draft to Jess first.
**Done when:** one real PO has gone the whole way, including a short delivery, and every
number on screen matches what actually happened.

## Reported, not built (recorded so nobody rediscovers them late)

- **PO revisions.** A sent PO that is changed is overwritten — there is no record of what the
  supplier actually agreed to. Real gap, deliberately deferred until the first real PO needs
  it (`docs/PURCHASING-WORKING-FLOW.md` §9).
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
| P2 | ⬜ after P1 · Claims tab + the interaction law | — |
| P3 | ⬜ after P1 · the two missing supplier calls (migration) | — |
| P4 | ⬜ where the goods go (migration) | — |
| P5 | ⬜ after P1-P4 · prove it with a real PO | — |
