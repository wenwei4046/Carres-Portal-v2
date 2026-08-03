# CHECKPOINT — Purchasing · Purchase Orders (Supplier Execution Register)

> **⭐ FROZEN 2026-08-03 by Jess.** *"现在批准这一个 checkpoint。不要继续加功能。"*
> The Workspace is DONE. **The next chat does NOT keep polishing this page** — her
> words: *"再继续改只会开始进入无限微调."* Read this whole file, quote her rules
> back in ONE line, then go to **Phase 3 — Batch Print & Communication** (§2's
> phase order), and wait for her.
>
> **Two things are deliberately NOT done, both hers, neither a gap to be filled
> by a chat that finds them:**
> - **The date-history redesign** (`Confirmed / Changed` + the recorded date +
>   reason, replacing `1st / 2nd / 3rd`) — she designed it, then ruled it OUT of
>   this checkpoint: *"History is a separate UI concern … a dedicated UI refinement
>   AFTER the Purchase Orders page is frozen. Do not mix it into this checkpoint."*
>   It needs no migration and no api change — `recorded_at` and the `shipping` /
>   `delayed` answer are already on the wire.
> - **The 50–100-line layout stress test** — she requires a REAL historical PO and
>   refuses synthetic data (*"假的 80 行"* would be `Booqit` × 80 and would expose
>   nothing). **MEASURED ON PROD 2026-08-03: not one of her six criteria exists** —
>   biggest real PO **4 lines** (biggest order 8), lines carrying a salesperson
>   remark **3**, longest remark **24 chars**, max PO qty **2**, lines with
>   `received_qty > 0` **ZERO**, revisions **1**. The test is correct and it is
>   BLOCKED until real POs run; it may never be satisfied by inventing data.
>
> **Prior handover, 2026-08-02 session end** (kept because §2's build history is
> still the record of how the page got here): the page was half-done with
> corrections pending; §2's steps have since been executed.

---

## 0 · WHO YOU ARE TALKING TO: JESS. Rules — with this session's failures baked in.

1. **Her word is the top law.** Docs are her records, not bosses. When she overrides an
   old rule: remind ONCE with the cost, do it, then REWRITE the record under her name.
   Citing a law must never read as resistance — it is bookkeeping of HER rulings.
2. **AUTO top-to-toe critical after EVERY change — even when she is rushing you.**
   This session's recorded failure: she said "i cant see! how", the chat patched fast
   and skipped the self-check, and she caught it. Speed never buys out the check.
3. **Complete EVERYTHING agreed, not half.** Her exact words when half was delivered:
   "why never complete and follow all we agreed and you only all did half and no
   checking no study, no brain!" Before replying done: re-read the WHOLE instruction
   list and tick every item.
4. **Never pick for her.** The chat chose which 5 columns survive compacting and
   dropped the column she ranked #2 that same morning. Column sets, words, orders —
   present, let her rule.
5. Plain beginner Chinese, step by step; English for tech nouns. Deliverables English.
6. Rhythm: ASCII → her yes → build → localhost:5221 → her yes → merge+deploy
   (web + Worker together — `packages/shared` and `apps/api` BOTH changed here).
7. One recommendation with why. PR/erp links bare on their own line. Copy masters
   (Excel · AutoCount · Gmail · Linear · GitHub · SAP), never invent, never taste.
8. Only answer her. Out-of-scope findings = one line at the end.

## 1 · WHERE THE WORK IS

- Worktree `…/.claude/worktrees/carres-portal-planning-e29002`, branch
  `claude/jess-workflow-setup-1585a7`, local commit `e13d8f67` (NOT pushed, NOT
  merged; prod untouched). Files: `apps/web/src/pages/operation/OperationPurchaseOrders.tsx`
  (the whole page) · `OperationApp.tsx` (bare `/operation/procurement` mounts it; slug
  routes keep the legacy shell for old `?po=` links) · `queries.ts` (`useOperationPoUnits`,
  `customer_delivery` on `operationPoListRow`) · `apps/api/src/routes/operation/pos.ts`
  (NEW `GET /:id/units` = per-unit ids from `ops_stock_items.unit_code` by `po_no`;
  list now computes `customer_delivery` = earliest SO delivery date).
- Dev servers (launch.json in THIS worktree): `api-planning` (:8899, needs
  `apps/api/.dev.vars`) FIRST, then `web-planning` (:5221, needs `apps/web/.env.local`).
  Both env files are already in place here. "Cannot open 5221" → restart both, silently.
- Full design history: memory `purchase-orders-architecture-freeze-2026-08-01`
  (v1 tree → v2 worklist → v3 split → v4 shell-copy → v5 REGISTER — read it, do not
  re-litigate). Related: `docs/CHECKPOINT-grn.md` (the GRN page, queued after this).

## 2 · THE PLAN AND THE LAWS — Jess re-ruled the whole sequence, 2026-08-02 (chat 2)

**FREEZE PASS (v8) — ✅ BUILT AND APPROVED 2026-08-03. Commits `0dede78f` +
`59ff1091`. This is the last change to the Workspace before Phase 3.**

- **`Goods Arriving At` → `Goods Arrival`, everywhere** (hers): `At` carries no
  information, and the column beside it is `Customer Delivery` — two dates of
  the same kind, and they now read as a pair. It is also the word
  `ORDERS-WORKING-FLOW.md` already used (`Waiting Goods Arrival`), so
  Purchasing stopped speaking its own dialect. The state action followed:
  `Confirm Goods Arrival Date`. Column order unchanged.
- **THE GAP AGAINST THE CUSTOMER'S DATE.** The register held both dates side by
  side and left the subtraction to the operator's head. **Measured on live prod:
  EIGHT of nineteen POs were already landing after the customer's date and two
  on the very day** — and most of those arrival dates are still our own
  estimate, so we knew before we had even phoned. `poArrivalGapOf` is ONE shared
  rule feeding the register column AND the workspace, so they cannot disagree.
  It rides the ARRIVAL date, never the customer's: the arrival is the number a
  phone call can still move. **SILENCE MEANS FINE** — room to spare says
  nothing; `same day` speaks amber because no room for one hiccup is not fine;
  a finished or cancelled PO stays quiet, its gap being history, not work.
  Listing prints `8d late` plain, the workspace prints `⚠ 8d late` (the page's
  own Overdue marker).
- **Current Action stopped living nowhere.** Two correct rules had combined into
  a broken screen: v7 removed the hero because the register's column carries it,
  and in compact that column was 119px against a 126px `Waiting for Goods` —
  clipped with `text-overflow: clip`, so not even an ellipsis said so. Compact
  now measures out **141px** (Supplier and Items lent 12 and 10 of their own
  MEASURED slack). **No workspace row was added**: `Next — Waiting for Goods`
  was built and then deleted by her — a STATUS wearing an action's label, in a
  slot that carries a real ACTION on a PO with an open call. One label cannot be
  true of both.
- **The header carries ONE thing beside the date.** `2nd date · 6 days later`
  was history squeezed into a header, and it was what made that row wrap.
- **ONE product name on both surfaces.** The list said `Cody Q`, the document
  said `SKU-CODY-Q`. The register's OWN naming function is now passed down to
  the workspace, so they are structurally unable to drift apart again rather
  than two rules that agree today. The variant sub-line went with it
  (`Booqit 1B(LHF)` already carries it). The code identifies rather than
  describes, so it moved to hover and to the row's ⋮ surface as `Item ID`.
- Also: the date history's reason stopped being cut (`Production Delay`
  overflowed by 3px and printed `Production Del…`); the ordinal and date gave
  back 20px. The company-wide supplier template's typo `com**f**irm` → `confirm`
  was fixed in `purchasing_settings` (it goes out to every supplier).
- **WIDTHS ARE MEASURED, NEVER ESTIMATED** — and this is the durable rule:
  jsdom has no widths, so a page test structurally CANNOT catch a truncation.
  `Goods Arrival` was set to 160px, then measured against the worst line the
  cell can hold (`25 Aug 26  8d late (revised)` = 189px) and corrected to 192.
  Only the browser can prove this; the test suite must never be trusted for it.
- Verified: web tsc 0 · page tests **51** · shared **23** · negative controls
  fire (drop the finished-PO guard → the silence test; put the SKU code back →
  the two naming tests). **check-design UNCHANGED — proven by linting the
  pre-change tree, which also reports 8445; §4's "8440" was stale.**

**STEP 1 · LISTING FREEZE — ✅ EXECUTED 2026-08-02.** Her FINAL columns (this
version supersedes the earlier 6-column ruling — she put `Customer Delivery`
back and moved `PO Issued` to 1st, both hers):
```
PO Issued · Supplier · PO No. · Items · Customer Delivery ·
Goods Arriving At · Received · Current Action
```
- `PO Issued`, never `Created` — the official date the supplier receives the
  PO · starts the lead time · matches the PDF · operators say "the PO we
  issued last week". A system Created date, if ever wanted, goes in the
  workspace's details block, never the listing.
- **LISTING LAW (hers, long-term for Purchasing):** the listing is AutoCount —
  for FINDING (sort · filter · search), never for working; the work happens in
  the right workspace. **Default order = `PO Issued` OLDEST first** (the buyer
  chases the longest-waiting PO, never the biggest number). Every column has
  Excel ▼ + header sort + search-inside; filters combine and persist until
  Clear. Sticky header, one vertical scroll, no pagination feel.
- `Customer Delivery` = the **EARLIEST** date across a merged PO's SOs, and the
  header tooltip says so — until P5 allocation upgrades it to line-level.
- Items speaks **MODEL** (server-resolved `model_name` on the wire — the
  browser catalog missed non-active SKUs and printed codes), `×N` only when
  N ≥ 2. `Cody Q · +2` · `Sonic K ×3`.
- Compact (workspace open) = `PO Issued · Supplier · PO No. · Items · Current
  Action`; HONESTY GUARD unchanged.
- Search stays beside the ▼s (two jobs): PO / Supplier / SKU / Model / SO /
  Customer (customer names now ride `orders[]` on the global list).
- Built with it: kit `ColumnFilter.range` (Custom Date Range… two-date pair +
  Apply) · kit `rowMuted` (cancelled rows grey — 2990s) · `(revised)` on Goods
  Arriving At (≥2 distinct answered arrival dates in the 0306 promise ledger;
  quiet today, the Phase-4 write door feeds it) · `lib/excel-date-filter.ts`
  (ONE date-▼ machine, built to flow back portal-wide) · first test files
  (page 15 + date-filter 9 + api register test).

**SURFACE LAW (Jess, 2026-08-02 — ran here first, review then flow back):**
grey is CHROME, white is every working surface. Tokens in tailwind config:
`kit-canvas` (app bg) · `kit-strip` (header strip, slate-2) · table header =
`kit-slate-3` (DataTable thead moved off slate-4). Three greys per page, max.
Copy masters by STRUCTURE never colour: GitHub = layout/reading pane/timeline ·
Excel+AutoCount = tables · Linear = density/microcopy (70%) · SAP Fiori =
business documents (10%) · Gmail = communication. **No Inspiration Board doc
yet** — her call: prove the tokens live first, then write back into the
existing token/UI law files.

**HER PHASE ORDER (replaces the old step list):**
```
1 Listing (✅) → 2 Live Purchase Order IA FREEZE → 3 Batch Print +
Communication (core, not enhancement — wire the 0307 renderer, never the old
po-template) → 4 Supplier Updates (3A business freeze, THEN 3B write door) →
5 Receiving Integration → 6 Relationship Map (enhancement, last)
```
Business before Data, Data before UI, UI before Write Door. Tests ride EVERY
step, never queue at the end.

**v7 — SUPPLIER DATE STATE MACHINE + FINAL WORKSPACE, FROZEN 2026-08-02
LATE. Shared + api HALF BUILT, page NOT YET — parked mid-build when Jess
opened the Receiving chat. THE NEXT PO SESSION EXECUTES THIS FIRST.**

FROZEN (hers, this order of authority):
- **Goods lifecycle state machine** (states describe the GOODS, actions
  describe the person): `Waiting Supplier Date` (renamed from Need
  Confirmation) → `Waiting for Goods` → (⚠ Overdue, a SUB-STATE of waiting,
  NEVER its own rail bucket) → back to Waiting on a new date → `Ready to
  Receive` = goods ARRIVED (received > 0 — a date merely passing is NOT
  ready; her machine corrected the old rule) → Completed. Rail stays 5
  buckets; Waiting for Goods may show a red ⚠ n tail.
- **Actions**: Waiting Supplier Date → `Confirm Goods Arriving Date`
  (short `Confirm Arrival`) · overdue → `Contact Supplier` (outranks the
  engine's call — the confirmed date is SPENT, never Confirm again) ·
  waiting → `Waiting for Goods` · ready → `Open Receiving`.
- **The date door** (situations A supplier tells early / B nobody told us —
  same door): click the SUPPLIER DELIVERY DATE row in the workspace header →
  extend in place → key new date + Reason ▾ + Remarks → Save = ONE
  transaction (0306 RPC: ledger row + eta moves + delay planning push +
  history sentence). Repeatable forever, append-only, history rows under.
- **Reason vs Remarks, two fields never folded**: Reason = countable
  category `PO_DELAY_REASONS` (Production Delay · Material Shortage ·
  Transport Delay · Waiting Customer Confirmation · Factory Closed ·
  Other); Remarks = free-text real story.
- **Final workspace ASCII (3 zones)**: ① FIXED HEADER — PO ISSUED ·
  DELIVERY TO · SUPPLIER · SUPPLIER DELIVERY DATE (+ ⚠ Overdue by N days) ·
  PO No. right; date row extends (A first-confirm form / B history / C
  delay form). NO status badge (rail owns progress), NO Current Action
  hero (the register column + extend carry it). ② ITEMS — EXCEL rows: one
  row per SO × SKU (never the paper's stacked cells) · # · SO NO. ·
  DESCRIPTION · SIZE · QTY · RECEIVED · REMARK(read-only, the SALESPERSON's,
  flows from the SO — operation never keys it) · TOTAL row + `Open
  Receiving →` (the RECEIVING panel was folded in here — quantities live on
  the rows). Row click extends in place: DESTINATION fact (+ [Change] when
  Phase 4/5 opens the Split/Revision door) + unit ids + problems.
  ③ ACTIVITY — collapsed WhatsApp draft + tools + business timeline.
  Supplier-facing note ≠ internal note: REMARK column prints for the
  supplier; "why it is urgent" NEVER (it goes to po_notes/ACTIVITY later).

**PAGE BUILT 2026-08-02 (this session, after the checkpoint):** header 4
label-rows + PO No. right (NO badge — the rail owns progress) · the
SUPPLIER DELIVERY DATE row opens IN PLACE (engine calls + the ledger's own
history; `promises` now rides the list wire) · ITEMS is the EXCEL grid off
`so_rows` (# · SO No. · Description · Qty · Recv · Remark, one row per
SO × SKU, salesperson remark read-only) with a TOTAL row + `Open
Receiving →` (the Receiving PANEL is gone — quantities live on the rows) ·
row click extends in place (Destination fact today; [Change] = Phase 4/5's
Split/Revision door) · ACTIVITY unchanged. 25 page tests green.
**STEPS 2 + 3 ✅ SHIPPED 2026-08-02 — WHAT WE SENT, AND WHICH VERSION
(migrations 0312 + 0313 applied to prod).** Jess: *"it cannot said sent due
to download only"* and *"why you keep asking me which you should finish the
job"* — both fair; this is the whole of her step 2 and step 3.
- **The ACT records itself.** Opening WhatsApp or the mail client IS the
  send, so there is NO `I've sent` button — a record somebody must remember
  to make afterwards is a record that will be wrong. **Copy records
  nothing**: copying words is not sending them (guarded by a test).
  The channel written is the one actually used.
- **The draft is EDITABLE** (a textarea, not a `<pre>`), and `Save as
  template` stores it as ONE company-wide text with the placeholders put
  BACK (`{supplier} {po} {items} {date}`) — otherwise the next PO would
  inherit this one's number. Per-supplier templates refused: eleven
  templates are eleven places to edit; a special instruction is a remark.
- **Email = `mailto:`** (her pick): subject + body pre-filled, sent by the
  operator's own client. The portal has NO email sender and does not
  pretend to; a supplier with no address gets the sentence `No email on
  file for {supplier}`, never a dead button.
- **Revision** (`po_revisions`): a send freezes a SNAPSHOT of what the
  supplier was given — the date, the destination, every line. A send mints a
  new revision **only when the document changed since the last**, so
  re-sending an unchanged PO is the same Revision N: the supplier is not
  being asked to replace anything. The timeline reads
  `2 Aug 26 · sent via whatsapp · Revision 1`.
- **Duplicates collapse**: same day + same channel + same revision is ONE
  line with a `2×` count — opening WhatsApp twice in a morning is one send
  (she caught the double row).
- `po_sends` + `po_revisions` carry a SELECT policy and **no write policy at
  all**, so the RPC is the only door (0303's discipline).
- **A defect of MY OWN, caught and undone in the same session**: 0312 added
  `suppliers.email` when `contact_email` had existed since the supplier
  portal and TWO of ten suppliers already filled it — two columns for one
  fact is `ops_order_control.balance`'s disease. **0313 drops it**, behind a
  guard that refuses to drop a column holding rows. The mailto reads
  `contact_email`.

**⋮ ROW MENU (Jess: "why so fragile?").** The line's actions were reached by
clicking the ROW and then clicking a WORD — three steps, and a mis-click
collapsed it. Now every row ends in a `⋮` and the row itself toggles nothing:
Excel right-clicks, Gmail and Linear use a ⋮, and a row action must be a
control with a NAME rather than a word you happen to hit.

**INLINE EDIT (Jess, 2026-08-02: "it always show like that?").** The line's
work surface was a form standing open on every row with a Save that is grey
most of the time — furniture. Now it is Linear's/Notion's manner: a value is
TEXT until clicked, then it becomes a control; **Enter saves, Esc cancels,
and there is no Save button anywhere on the surface**. Quiet state reads
`Destination Carres Klang` / `Ops remark Add a note…` — two lines, no
widgets. Esc restores and posts nothing (tested). The same lesson as the
date field one hour earlier: the quiet state must LOOK quiet.

**STEP 1 OF HER THREE ✅ SHIPPED 2026-08-02 — WHERE EACH LINE GOES
(migration 0311_where_each_line_goes APPLIED to prod).** Her words:
*"operation under item due to we need key in destination, you forgot
again"* — purchasing's ONLY per-line job, deferred by me three times and
now built.
- `purchase_order_lines.destination_id` (NULL = wherever the PO goes, so no
  backfill exists) + `ops_remark`. **ops_remark is a COLUMN, not an attrs
  key, precisely so it can never print**: `purchasing_po_document`
  allowlists attrs keys and selects named columns, and 0311's own sanity
  block FAILS the migration if that function ever mentions it.
- Three write doors, gated by the existing `purchasing_supplier_call_gate`
  (same person, same job, same document — no new duty key):
  set a line's destination · SPLIT part of it · set the ops remark.
  **The split is her frozen law**: the LINE splits, the PO never does — one
  document, one supplier. **Received quantity NEVER moves**; only the
  un-received remainder can be re-routed (0257's discipline), and moving
  the whole line is refused as "not a split — set its destination instead".
- UI: the row extends in place → `Destination ▾` + `Move [n] of [free]`
  (appears only when the destination changed and more than one is free) +
  `Ops remark` with the placeholder `Internal — never printed`. The effect
  line states the outcome before the press (`1 of 3 move; 2 stay.`). Under
  the description the row now prints `Sales: …` (theirs, prints on the PO),
  `→ AL Sungai Buloh` (only when re-routed) and `Ops: …` (ours, never
  prints) — the REMARK column was dropped, too narrow for either.
- Verified: dry run in a rolled-back transaction on prod (6 assertions incl.
  every door refusing an ungated caller and the printed-PO guard), rollback
  verified total, applied, then 2 columns · 3 doors · authenticated true /
  anon false · 0 lines re-routed · 33 lines untouched.
- STILL OWED of her three: **step 2** (editable WhatsApp draft · ONE
  company-wide template · `po_sends` so `Nothing sent yet.` can change ·
  Email via **mailto**, her pick — the portal has NO email sender and a
  `mailto:` needs only `suppliers.email`) and **step 3** (Revision
  snapshots, so the supplier always holds one current version).

**LIVE-TEST PASS 2 (Jess at the screen, 2026-08-02): the date field starts
EMPTY.** She read the pre-filled field as "I am editing the existing date"
and the sentence under it (`Supplier still on 19 Aug 26.`) as nonsense —
both were right. A date already given can NEVER be edited: the ledger only
ever gains a row. So the field is empty, labelled `New date` (or `Date` on
a PO with none), Save is disabled until something is keyed, and the effect
sentence stays SILENT until then — with nothing keyed there is nothing to
record, and a sentence about that is noise. Once keyed it says exactly one
of: `First date from {supplier}.` · `Delay N days from {date}.` ·
`Earlier by N days than {date}.` · `Same date — the supplier confirms
{date}.` The field clears itself after a save.
**REPORTED, not invented**: an EARLIER date is recorded with the answer word
`delayed`, because 0306's CHECK gives this call exactly two answers
(`shipping` | `delayed`) and a supplier pulling a date IN has no honest word
yet. The screen says `Earlier by N days`; the ledger says `delayed`. Ruling
that needs a word is Jess's — a third answer would be a CHECK + engine
change, not a label.

**LIVE-TEST PASS (Jess at the screen, 2026-08-02):**
- The date HISTORY is numbered, SAP's shape not 2990s' four columns
  (`_2 _3 _4` runs out at the fifth answer; our ledger never does):
  the row reads `25 Aug 26 · 3rd date · 6 days later`, the extend lists
  `1st / 2nd / 3rd` oldest-first with reason + who + when. **1st = the
  first date the SUPPLIER gave**, never the engine's estimate (an estimate
  is our guess, not their promise); one date earns no ordinal; a repeated
  confirmation of the same date is not a new date. `slipDays` = current −
  first, which is the number R5's supplier scorecard will read. Shared
  `poDateHistoryOf` + `ordinalLabel`, 4 tests. ZERO migration — pure
  reading of 0306's ledger.
- The form SAYS what Save will record before it is pressed (`First date
  from the supplier.` / `Supplier still on 19 Aug 26.` / `Delay 6 days
  from 19 Aug 26.`) — the Reason picker only appears on a changed date,
  and a picker you cannot see until it appears is invisible (she caught
  it live).
- `Open Receiving` DELETED: the warehouse checks in over there and the
  Recv column moves BY ITSELF — a link that only navigates is a step
  purchasing never takes.
- ACTIVITY's `PO issued` DELETED (the header already states that date; a
  timeline whose only entry repeats the header teaches nothing). It reads
  `Nothing sent yet.` until a sending store exists — an honest empty.
- REMARK column ruled SALES-owned and read-only: it prints for the factory
  and it is what the salesperson keyed on the SO. Purchasing's own channels
  are the DESTINATION (per line) and the WhatsApp draft — one column, one
  owner.

DATE DOOR ✅ SHIPPED 2026-08-02: migration **0310_supplier_date_door
APPLIED to prod** (tracker tail was 0309 — read there, never off `ls`, since
the repo's file tail is 0307 and a parallel lane holds 0308/0309). `remarks`
on the ledger + a FIRST-CONFIRM branch in `purchasing_record_tomorrow_delivery`
(old 4-arg dropped first — a defaulted param mints a second signature).
Dry-run in a rolled-back transaction on prod first, rollback verified TOTAL,
and the harness was proved able to FAIL. Post-apply: remarks col 1 · exactly
1 function, 5 args · `authenticated` true / `anon` false · 0 rows touched.
**A defect in MY OWN harness, caught before it lied**: the first "is the old
arity gone?" assertion CALLED the 4-arg form — which now resolves to the
5-arg function with `p_remarks` defaulted, hits the role gate, and is
swallowed by `when others`, so it could never fail. Rewritten to read
`pg_proc.pronargs`.
The FORM is live in the workspace: ONE date field — the same date the PO
holds means the promise stands (`shipping`), a different one is `delayed`
and the Reason ▾ appears; Remarks is free text beside it. 27 page tests.

WAS OWED (now done): the date FORM (key a new date + Reason ▾ + Remarks) — it needs
the migration below, so today the extend shows facts and history only, no
dead Save button.

BUILT ALREADY (committed): shared `po-workspace.ts` v7 (lifecycle labels ·
poOverdueDays · Contact Supplier · PO_DELAY_REASONS · ready=arrived fix,
13 tests) · api list now derives `so_rows` per line (SO × SKU dealing +
salesperson remark from order_lines.attrs.remark) · zod
recordTomorrowDeliveryInput gained firstDate + remarks · route passes both.

NOT BUILT YET (the next PO session's first job): the page — header 5-row
fixed block · date-row extend forms (A/B/C) · Excel items grid off
`so_rows` with RECEIVED + TOTAL + row-extend · rail ⚠ tail · listing
⚠ Nd marker · ACTIVITY unchanged · tests. Plus THE MIGRATION below —
Jess approves, tracker-tail numbering, apply BEFORE merge.

MIGRATION DRAFT (guardrail 8 — lives HERE, never in supabase/migrations
until approved). Purpose: ① `remarks` column on the ledger ② the FIRST
confirm (eta NULL) through the same RPC:
```sql
-- draft: supplier date door — remarks + first confirm
alter table public.po_supplier_promises add column if not exists remarks text;
comment on column public.po_supplier_promises.remarks is
  'Free-text story beside the countable reason category (Jess 2026-08-02).';
-- rule 8: defaulted params mint a SECOND signature — drop the old one first
drop function if exists public.purchasing_record_tomorrow_delivery(text, text, date, text);
-- recreate = 0306''s body with: + p_remarks param written to the new column;
-- + first-confirm branch: when v_po.eta_date IS NULL, only answer=''shipping''
--   with p_new_date is legal; v_about := p_new_date; insert row (about_date =
--   the given date, previous_date null, new_date null); update eta_date;
--   purchasing_push_supplier_date; history ''%s confirmed the delivery for %s''.
-- assert exactly ONE signature survives; dry-run in a rolled-back txn on prod.
```

**SLIM PASS (v6) — ✅ BUILT 2026-08-02 (Jess caught the arrows):**
- The three pane-collapse arrows + their leftover strips were MY invention
  (no master grows arrows on panels — rule 7 breach, admitted). Gone:
  rail and listing no longer hide (overrides her 8/2-morning "all three
  panes hide" — reminded once, she confirmed); ONE toggle survives — the
  workspace open/close that drives Gmail compact mode — and it lives in
  the SHELL's page-meta slot beside the search.
- Search moved into the shell header's page-meta slot (Gmail: search lives
  in the header, zero body height — "i dont have tall"); the listing's
  whole toolbar row deleted, the register now starts at the table.
  NOTE for Loo's five-slot law: the page-meta slot doc says "freshness /
  refresh" — a page-scoped search there is an extension, flagged not
  hidden.
- Items header `Sales Order` → `SO No.` (hers).

**COMPACT PASS (v5) — ✅ BUILT 2026-08-02, after the merge of main
(PR 560/561 — SHELL LAW):**
- origin/main MERGED (one conflict in api pos.ts, resolved: kept our
  /:id/units route + main's new 0307 print-data comment). The page's own
  breadcrumb strip + TopBarIcons DELETED — PurchasingTabs IS the whole 44px
  header now (壳画头; pages never draw a header). Browser tab titles come
  from the shell.
- Workspace compacted (Jess): the status Badge back on the SAME ROW as the
  PO number · the old header block and PURCHASE ORDER merged into ONE
  untitled PO block (Supplier · Deliver To · PO Issued at top, then items)
  · Current Action moved INTO SUPPLIER (it is supplier work) as the
  section's opening hero. Categories now: PO block → SUPPLIER (action +
  Goods Arriving At + Open Actions) → ACTIVITY → RECEIVING.

**POLISH PASS (v4) — ✅ BUILT 2026-08-02, Jess's "freeze before Print" pass.
Only rhythm/typography/spacing/hierarchy moved; zero function change:**
- Header reads identity → status → action, STACKED (PO no., then the state
  Badge on its own line, then the Current Action hero) — never three things
  fighting on one line. PO Issued moved into PURCHASE ORDER, Received lives
  only in RECEIVING: the header carries identity · status · action, nothing
  else.
- Items table breathes: taller rows, DESCRIPTION is the hero, Sales Order +
  Qty read quiet.
- ACTIVITY is ONE timeline: tools row → hairline → date-over-event entries
  (the "History" sub-label deleted — the divider is the cut).
- LISTING speaks short: `PO_STATE_ACTION_SHORT` — `Confirm Arrival` (her
  `Confirm ETA` candidate REFUSED: the Business Date Dictionary bans "ETA";
  reminded once, compliant option of her two taken). Full wording stays in
  the workspace hero — C1's two-string discipline.
- Greys cut to: canvas · table-header slate-3 · hairlines. The header
  strip's own grey RETIRED (kit `strip` token removed) — too many greys
  were competing.
- HER RULING: this Workspace is the TEMPLATE for Receiving/Claims; Batch
  Print & Communication (Phase 3) does NOT start until she freezes this
  polish live.

**STEP 2 FINAL (v3) — ✅ BUILT 2026-08-02, supersedes the v2 text below.**
Jess re-ruled the workspace around WORKFLOW, then froze:

- **WORKSPACE LAW** (stronger than Mission — the review rule for every
  future Workspace: PO, GRN, Claims, Payments): *every section answers ONE
  operator question; a field that answers none does not belong.*
  `PURCHASE ORDER` "What is this PO?" (UI speaks business — never
  "Reference"; Reference stays the internal mission name) · `SUPPLIER`
  "What must I do with the supplier?" (largest, grows forever) · `ACTIVITY`
  "What have we communicated?" (bigger than Communication — keeps the name)
  · `RECEIVING` "What has happened after arrival?" (one line + door).
  Order: Header → Purchase Order → Supplier → Activity → Receiving.
- **WORK HEADER**: PO no. + state Badge + **Current Action as the hero —
  TYPOGRAPHY ONLY** (Jess: start with less visual weight; a highlighted
  container only if live use proves it too quiet; no GitHub blue box yet)
  + PO Issued · Received. **Expected Arrival deliberately NOT in the
  header** — it lives in SUPPLIER with its history.
- **ONE action source (Law 7)**: `packages/shared/po-workspace.ts` —
  `poCurrentActionOf()` asks the ENGINE's calls first, falls back to the
  state words Jess ruled: `Confirm Goods Arriving Date` ·
  `Waiting for Goods` (never "No Action Today" — today's nothing is
  tomorrow's something) · `Open Receiving` (the system is not a person —
  no "Hand to") · completed/cancelled = no hero. The header hero AND the
  register's Current Action column read the SAME function — the 19 dashes
  are gone. Found while testing: a partially-received PO's action is the
  BALANCE call (engine outranks "Open Receiving") — correct business.
- **CARRES WORKSPACE RHYTHM v1** (delivered in-chat 2026-08-02; flows into
  the token/UI-KIT files after her live review — NO new doc, her rule):
  one continuous working document · hairline + small-caps sections (24px
  gap) · 24px label-value property rows (label col 128px, never stacked) ·
  document table 28px rows / 24px caps header · ONE loud element ·
  timeline rows 20px · WhatsApp draft collapsed to one line until opened.
  Masters: Linear property rows · GitHub one-loud-element + timeline ·
  AutoCount density; colours never copied, tokens only.

**STEP 2 · SUPPLIER WORKSPACE v2 — ✅ IA FROZEN AND BUILT 2026-08-02.**
Her frozen architecture (the SAME language every Document Workspace — PO,
GRN, Claim — will speak):
```
WORKING HEADER   PO no. + work-state Badge + PO Issued · Goods Arriving At ·
                 Received (facts live HERE, never repeated below)
REFERENCE LAYER  NO section title — the panel IS the PO. "What is this PO?"
                 only: Supplier · Deliver To (names — no phone/address; Open
                 WhatsApp is the phone) + items (Sales Order · Description ·
                 Qty). Item ID removed — it answers what the WAREHOUSE
                 receives; it belongs to Receiving/GRN (GET /:id/units kept).
SUPPLIER FOLLOW-UP  work — Goods Arriving At + state (expected/confirmed);
                 a field's HISTORY lives beside the field, never in Activity
                 (slot built; the Phase-4 ledger read fills it); the engine's
                 calls under "Open Actions". Edit door = Phase 4.
RECEIVING SUMMARY  read only — Received · Remaining · Open Receiving.
ACTIVITY         (renamed from Communication) tools on top + the BUSINESS
                 timeline below — a READ-TIME MERGE of the real stores,
                 never a master activity table, never field changes. Today:
                 PO issued; sends/notes/receiving events join in Phase 3/4.
```
Letterhead (logo + "PURCHASE ORDER" wordmark) DELETED — the paper look
belongs to the printed 0307 document. No dead buttons: Change Deliver To ·
Revision · Supplier DO · Email · I've Sent · Notes · Print / Batch Print all
deliberately absent until their phases. +5 workspace tests (page suite 20).

**FROZEN 2026-08-02 (chat 2, data-model laws for Phase 4/5 — NOT built):**
- PURCHASE ORDER RULE: One PO = one Supplier, one revision-managed document.
  Supplier always sees ONE story (PO-2048 · Revision N; a new revision
  REPLACES the old and says so). Deliver To is an EXECUTION fact on the PO
  LINE (default = whole PO one destination); a qty split AUTO-SPLITS the
  line (received qty stays with the original; only the un-received remainder
  may move). Never a second PO, never a silent edit of a sent document, no
  A/B suffixes, no allocation table — Receiving/Delivery/Claims all read
  the same PO lines.
- HOW (Phase 4/5): `purchase_order_lines.deliver_to` (nullable, falls back
  to the PO's warehouse) · `po_line_split` RPC · `po_revisions` append-only
  snapshots · `po_sends.revision`. Trigger = the Change Deliver To door in
  Supplier Follow-up ("Move how many?"); operator thinks destination, the
  system does lines + revisions.
- 3A questions still open: what a destination may BE (registry incl. AL /
  HOUZS staging points) · a staging line closes by DELIVERY photo, not
  warehouse check-in · Revision vs docNumber's `-B` law (Revision wins,
  rewrite the doc-numbering record) · "Revision" = OUR document version;
  supplier date changes stay `(revised)` — two words, never mixed · new
  words touch Loo's frozen information model — one-line notice to him,
  her call on sign-off.
From 2990s only three copies approved: `(revised)` ✅ · cancelled-grey ✅ ·
plain-words error messages (owed to Phase 4's refusals).

## 3 · WHAT IS BUILT AND VERIFIED (do not rebuild)

- Shell = To Order 1:1 (header strip + tabs + 200px rail). Rail = ONE group
  **SUPPLIER PROGRESS**: All · Need Confirmation · Waiting Goods · Ready to Receive ·
  Completed · Cancelled — DERIVED (cancelled own bucket · ready = received>0 or
  eta≤today · need_confirmation = no eta · else waiting). Blue selection = blue-3 bg +
  blue-9 left bar (To Order's exact recipe).
- Listing = kit DataTable, Excel sort + ▼ per column, search (po/supplier/sku/model/SO).
  Items = To Order's own `railItemLabel` ("Cody Q ×1"). Engine-ranked default order.
- **Reading-pane compacting (Gmail)**: workspace open → identify columns only, all
  full-size, no h-scroll; workspace collapsed → full register (+ min-w 880 h-scroll
  fallback). HONESTY GUARD: a column carrying an active filter/sort is never hidden.
  §2① changes which columns exist — re-derive the compact set WITH her.
- All three panes hide/expand (nav included — she amended her own earlier rule).
- Workspace: real per-unit **Item IDs** (id-xxx…, qty 2 = 2 ids, verified on PO-2037) ·
  Sales Order stacked list on merged POs · **Goods Arrival auto-default** =
  placed_at + production days on the supplier's own week (0303 settings; no setting →
  no default, P1's law; grey = expected, ink = supplier-confirmed) · Received + Open
  Receiving · engine calls list · **Communication desk** (WhatsApp draft from live
  data + Copy + Open group via `suppliers.whatsapp_group_url`).
- Print PDF REMOVED on purpose: the old `po-template.tsx` prints money, violating
  PO-PDF-STANDARD §2. The real renderer wires to 0307 `purchasing_po_document` —
  its own card. Never re-add the old button.

## 4 · GATES (state at the 2026-08-03 freeze)

web tsc 0 · api tsc 4 pre-existing (`rental-sell.test.ts`) · **check-design 8445
total, category G `▲ +6 over baseline 683`** · design-standard gate ✓ ·
OperationApp routing tests 8/8 · **`OperationPurchaseOrders.test.tsx` 51** ·
`po-workspace.test.ts` 23.

**The 8445 and the G +6 are NOT this page's doing, and that was PROVED rather
than assumed**: the changed files were set aside, the pre-change tree was
linted, and it reports the identical 8445 / G +6. The old note here ("8440 with
I +3") was stale — I now reads `▼ −2`. **Method for the next chat: never quote a
lint delta without linting the tree WITHOUT your change.**

**A gate this page cannot have**: jsdom has no widths, so no page test can
catch a truncated cell. Every column width here is measured in a real browser
against the worst line the cell can hold. A chat that changes a width and runs
only the suite has verified nothing.

## 5 · KNOWN GAPS (report, never silently build)

- Supplier "confirm Goods Arrival" WRITE door (promise ledger kind `arriving`) —
  without it Waiting Goods stays 0 forever. The next real slice after §2.
- **The date HISTORY redesign** — hers, designed 2026-08-03 and deliberately kept
  out of this checkpoint (see the header). `Confirmed / Changed` + the recorded
  date + the reason, replacing the `1st / 2nd / 3rd` ordinals. Zero migration,
  zero api change: `recorded_at` and the `shipping` / `delayed` answer already
  ride the wire. Do NOT fold it into a Phase 3 card.
- **The 50–100-line layout stress test** — hers, and BLOCKED, not forgotten.
  Real PO only; she refuses synthetic data. Prod ceiling measured 2026-08-03:
  4-line biggest PO · 3 remarks · 24-char longest · max qty 2 · zero received ·
  1 revision. Re-measure before claiming it can run.
- Two surfaces still spell one thing two ways, both REPORTED and not fixed:
  ACTIVITY prints `sent via whatsapp` beside a `WhatsApp` button, and the grey
  vs ink `Goods Arrival` (our estimate vs the supplier's own word) carries no
  tooltip while `Customer Delivery` does.
- Supplier contact data is thin, measured: **2 of 10 suppliers hold an email and
  both are `@carres.com`** (the Email button would write to ourselves); 5 of 10
  hold a WhatsApp group. Phase 3 depends on this.
- The date history prints no WHO and no WHEN. `recorded_by` is on the row but is
  a uuid — printing a name needs an api join, which is why it was reported
  rather than half-built.
- Missing stores: `po_sends` (I've Sent + history) · `suppliers.email` · PO notes ·
  supplier DO number/file. Per-line SO attribution = P5 allocation (accepted).
- Words owed to COPY-STANDARD: section titles · work-state names · `PO Issued` ·
  Communication desk words · the grey-date tooltip.
- ETA-model reminder: Loo froze "settle after real POs" — Jess overrode 2026-08-01
  (ledger = only write door). Recorded; optional Loo sign-off is her call.
