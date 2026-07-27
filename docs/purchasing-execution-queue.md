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
- **Zero purchase orders exist.** `purchase_orders` = 0 rows. Every P-card must prove its
  path works by creating a real PO, not by reading an existing one.
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
1. A settings store for the seven numbers in `docs/PURCHASING-WORKING-FLOW.md` §2.
   Production time is **per supplier × per category**; the rest are single values.
2. **Sofa production time becomes 14 working days** (it is 10 in the code and 5 in a stale
   Orders comment — three different numbers today, all wrong).
3. The supplier work week moves from being keyed by CATEGORY to being keyed by **supplier**
   (Nice Future 5-day · Ohana works Saturday). The category proxy is a known lie.
4. A **Settings** tab on Purchasing, manager-only, laid out per UI-KIT §A9. Every edit
   records who, when, and the previous value.
5. The engine reads the settings; the hard-coded constants are DELETED, not left as a
   fallback. A fallback is how a setting silently stops mattering.
6. `DELIVERY_LEAD_DAYS` (the POS's earliest sellable date — mattress/bedframe 14, sofa 21
   CALENDAR days) becomes one editable number. **Jess sets 30 at go-live.**

**Migration:** yes — a settings table. Draft it to Jess first (guardrail #8) and check the
remote tracker tail immediately before applying.
**Done when:** Jess changes sofa production time on screen and the order-by date on the To
Order tab moves the same day; no purchasing number is hard-coded anywhere.

## P2 · Claims becomes a tab, and Receiving is its own module inside

**Goal:** the four tabs of `docs/PURCHASING-WORKING-FLOW.md` §1 exist —
`To Order · Purchase Orders · Receiving · Claims · Settings`.

**ALREADY EXISTS:** the claim engine, its lifecycle, its quarantine rules (R2/R3/R4). This
card gives it a door; it changes no claim behaviour.

**Also in this card — the UI-KIT interaction law**, newly written and unimplemented
anywhere: click a queue tile → the table filters · click again → it clears · click a row →
the drawer opens on its FIRST tab · closing keeps the filter and scroll. Purchasing is the
first module to implement it; Orders already behaves this way and is the reference.

**No migration.**
**Done when:** a claim is reachable without leaving Purchasing; every queue tile filters and
clears; nobody types a URL to find a claim.

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
| P1 | ⬜ the numbers become settings (migration) | — |
| P2 | ⬜ after P1 · Claims tab + the interaction law | — |
| P3 | ⬜ after P1 · the two missing supplier calls (migration) | — |
| P4 | ⬜ where the goods go (migration) | — |
| P5 | ⬜ after P1-P4 · prove it with a real PO | — |
