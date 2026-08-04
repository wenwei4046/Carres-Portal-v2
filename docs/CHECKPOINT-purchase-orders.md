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

  > **UPDATE 2026-08-03 — the sentence above was true when written and is no
  > longer true of the code.** Kept, not deleted, on Jess's ruling: a checkpoint
  > records what was believed at the time, and deleting it hides why the button
  > was removed. **Measured this day, by reading the file rather than trusting
  > this record**: `apps/web/src/lib/pdf/po-template.tsx` was REBUILT to
  > `docs/pdf/PO-PDF-STANDARD.md` on 2026-08-02 (PR #557). Its payload is the
  > money-free `purchasing_po_document` (0307) — a money scan over the file
  > returns **zero** matches for `unit_price|line_total|grand_total|currency|
  > formatMoney` and for `\bRM\b`, and `po-template.test.ts` guards that it stays
  > so. **`renderPoPdf` is therefore already lawful**, and it is reachable today
  > from three older surfaces (`PoDetailModal` · `AssignPickupDialog` ·
  > `OrderDetailDrawer`) — the ONE place it cannot be reached from is this
  > Workspace. **Phase 3's Print work is WIRING, not writing a renderer**, and a
  > chat that reads only the paragraph above will waste a day rebuilding
  > something that exists. The instruction that survives unchanged: never re-add
  > a button that prints money.

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

---

## 6 · UPDATES — append only (Jess, 2026-08-03)

> **Her rule, given when a chat proposed rewriting §3:** *"Checkpoint 是当时为什么这样决定。
> 不是现在发现后来变了。"* Nothing above this line is ever edited to match a later fact.
> A later fact is a NEW dated entry here, and the reader compares the two themselves.

### 2026-08-03 · Update — the PO PDF renderer already exists

**What §3 says** (correct as at the moment it was written, and left untouched):
*"Print PDF REMOVED on purpose: the old `po-template.tsx` prints money, violating
PO-PDF-STANDARD §2 … Never re-add the old button."*

**What has since happened, measured 2026-08-03 on `origin/main`:**

- `apps/web/src/lib/pdf/po-template.tsx` was **rebuilt to `docs/pdf/PO-PDF-STANDARD.md`**
  by PR #557 (merge `33bcbad2`, 2026-08-02) and is money-free — its own header comment
  reads *"no RM figure ever reaches this component, so nothing here can print one."*
- `GET /api/operation/pos/:id/print-data` is already a thin door over the money-free
  `purchasing_po_document` RPC (migration 0307).
- `renderPoPdf` is exported from `apps/web/src/lib/pdf/render.ts`.
- **It has exactly ONE caller in the whole web app, and it is not this page**:
  `apps/web/src/pages/operation/components/AssignPickupDialog.tsx` (the pickup-partner
  dialog). So the buyer who owns the PO still has no way to print it.

**Both sentences of §3 therefore stay true and one is now narrower:** the OLD money-printing
template is still never to be re-added — it no longer exists. The renderer that replaced it
is the one Phase 3 wires up. **Phase 3 does not build a PDF; it builds the door to one.**

### 2026-08-03 · Update — 0312 / 0313 are a separate repository task

`po_sends` + `po_revisions` are live in prod and their `.sql` files exist in no branch.
**Jess ruled this repository governance, not a Phase 3 blocker** — registered as carry-forward
`migrations-0312-0313-have-no-file-in-any-branch`. Phase 3 continues; it needs no migration.

### 2026-08-03 · FROZEN by Jess — the operator journey for ONE Purchase Order

**Her ruling, verbatim:** *"Printing a PDF does NOT mean the Purchase Order has been issued.
Printing only generates the document. The business event happens only after the operator
delivers the PO to the supplier. Freeze the operator journey for one Purchase Order first.
Do not start with Batch."*

**The journey — seven moments. This is business, not UI. No button word is decided here.**

```
  ①  Operator opens the PO          register · PO Issued oldest first
  ②  Review                         destination · lines · dates
  ③  Print PDF                      the document now exists on paper / as a file
  ④  Open WhatsApp                  the door out of the portal
  ⑤  Copy message                   the words travel with the document
  ⑥  The PO leaves the portal      ← the last moment the system can SEE
  ⑦  History records what we KNOW  the click + the revision current at that click
```

**PRINT ≠ ISSUE — frozen, and it is four separate promises:**

| Print does NOT | Why |
|---|---|
| write History | printing is producing, not delivering |
| change Status | `po_sup_status` has no "we sent it" value; its next value, `acknowledged`, is the SUPPLIER's act |
| mint a Revision | a revision is what the supplier was GIVEN, and ③ gives them nothing |
| have a limit | printing to check the layout is printing; it may happen any number of times |

This follows the law Jess froze 2026-08-02 — **the act records itself** — and is the same
ruling already applied to `Copy`: taking the words out of the portal is not sending them.
**There is no "I've sent" button, and none may be added.**

**Where the record actually happens today** (measured, and unchanged by this freeze): the
WhatsApp anchor fires `send.mutate({ channel: "whatsapp" })` on click, so ⑥ and ⑦ are ONE
event — the operator never confirms anything after the fact. The revision is computed
server-side by `purchasing_record_send`, and a re-send of an unchanged document stays the
same revision.

**TWO POINTS LEFT OPEN INSIDE THIS FROZEN JOURNEY — neither may be resolved by a chat:**

1. **⑥ has no name yet, and the obvious one is already taken.** `Issue PO` is Loo's frozen
   To Order action that CREATES the PO (2026-07-30: *"Raising a purchase order is ONE
   action, never two … Only `Issue PO` mints the PO number"*). Using it again for "the
   supplier now holds it" is one word for two moments. `Send` is retired and banned from
   reuse (COPY-STANDARD, 2026-07-29). So ⑥ needs a word that exists in neither place —
   Jess's call, in the words step.
2. **④ has no door for some suppliers.** The WhatsApp button renders only when the supplier
   has a saved group link OR a usable contact number; otherwise it does not render at all,
   and Email is unusable (2 of 10 suppliers hold an email and both are `@carres.com`).
   Measured 2026-08-03: 5 of 10 suppliers hold a WhatsApp group. **How many of the other
   five carry a usable phone is NOT measured** — that number decides whether ④ is a rare
   gap or a routine one, and it is the first thing to measure when Phase 3 resumes.

**Order of work, hers:** freeze the journey (this entry) → button words · what History says
→ ASCII → review → build → test → **then** Batch. *"Do not let Batch drive the
architecture. One PO must be complete first."*

### 2026-08-03 · CORRECTION by Jess — History records facts, never assumptions

**Her ruling, verbatim:** *"Do not record: 'Supplier received the PO'. The system cannot know
that. Record only the action the system actually knows happened … Never record events the
system cannot verify. Keep the operator journey unchanged. Only adjust the wording of the
history event."*

**What changed above:** moments ⑥ and ⑦ of the frozen journey were rewritten under her name
(they previously read `Supplier receives the PO` / `History records it`). **The seven moments
themselves are unchanged** — this is a wording correction, not a re-design.

**The correction reaches further than the journey, and this was MEASURED, not assumed.** The
live timeline already prints `sent via whatsapp · Revision 1`. `sent` is a claim the system
cannot verify: all it observed is that an anchor was clicked. The operator may have opened
the wrong group, cancelled, or never pressed send at all. **So the shipped string carries the
same defect the correction was written to stop**, and Phase 3's words step must settle it
rather than inherit it.

**What the system genuinely knows, and nothing more:**

| Observed fact | Not observed |
|---|---|
| the WhatsApp/mail door was opened, at a timestamp | that a message was sent |
| the message was copied to the clipboard | that it was pasted anywhere |
| which revision was current at that moment | that the supplier read it, or holds that revision |
| the PDF was rendered | that it was printed, attached, or delivered |

**`Supplier received the PO` may only ever be written by something that watched the supplier
receive it** — a supplier portal, a read receipt, or an API. None exists. Until one does,
that sentence is banned from the screen.

**TWO CONSEQUENCES, both open, neither resolvable by a chat:**

1. **Is `PO shared with supplier` true of Carres?** Jess allowed it *"only if this matches our
   SOP"*. It is a claim about the operator's habit, not about the system: if pressing the
   WhatsApp door always means it goes out within the minute, the sentence is honest; if the
   door is sometimes opened to look something up, it is not. **Only Jess can answer that**,
   and the answer decides whether ⑥ is `PO shared with supplier` or only `WhatsApp opened`.
2. **Recording `Copied supplier message` reverses a rule she froze on 2026-08-02** — *"Copy
   records nothing: copying words is not sending them"*, and there is a test guarding it.
   The two rules are reconcilable and the reconciliation is the point: the old rule said Copy
   is not a SEND; the new rule says record what happened. So a copy may be recorded **as a
   copy**, and may never enter `po_sends`, whose rows carry a channel and drive the revision
   logic — a copy landing there would inflate the send history and dilute what a revision
   means. **BLOCKED on a real dependency**: `po_sends` / `po_revisions` were applied to prod
   as migrations 0312 + 0313 and their `.sql` files exist in no branch (carry-forward
   `migrations-0312-0313-have-no-file-in-any-branch`), so the table's CHECK constraints and
   the RPC's body cannot be read from the repo. **This is the first time that gap actually
   blocks work**, and adding an event kind by guessing the constraint is exactly the
   "95% right looks authoritative" failure that carry-forward warns about.

### 2026-08-03 · FROZEN by Jess — where the portal stops knowing

**Her ruling.** Opening WhatsApp does not mean the PO went out. **Four strings are banned
from the screen**, and one of them was mine from an hour earlier:

```
✗  Supplier received the PO      ✗  sent via WhatsApp
✗  PO shared with supplier       ✗  The PO leaves the portal
```

**The journey, re-frozen with her boundary and her order.** Note ④ and ⑤ swapped: her
sketch reads *"Print PDF → Copy message → Open WhatsApp → Portal stops knowing"*, which is
also the real sequence (copy the words, then open the app and paste).

```
  ①  Operator opens the PO       register · PO Issued oldest first
  ②  Review                      destination · lines · dates
  ③  Print PDF                   the document exists — records nothing, no limit
  ④  Copy message                records NOTHING (her 2026-08-02 rule, re-confirmed)
  ⑤  Open WhatsApp               the last thing the portal can observe
  ─────────────────────────────  PORTAL STOPS KNOWING (her line, verbatim)
  ⑥  …the supplier's world       unobservable: sent · read · acted on
  ⑦  History records the CLICK   never the send · with the revision current at it
```

**The live string is corrected by her, in her words** — Phase 3's words step ships it:

```
  was:  3 Aug 26 · sent via whatsapp · Revision 1
  now:  3 Aug 26 · WhatsApp action recorded · Revision 1
```

**A real send/receive event may be recorded only when something actually watched it** — a
WhatsApp API, a supplier portal, a read receipt, **or Jess re-approving a manual confirmation
step**. That last door is hers to re-open; nobody else may.

**THE FLOOD SHE NAMED IS ALREADY PREVENTED, and this was measured rather than promised.**
Her worry — *"Timeline 会被无结果的点击灌满"* — is answered by the duplicate collapse she
herself caught on 2026-08-02: same day + same channel + same revision renders as ONE line
with a `2×` count (`groupSends`). So the row stays (it carries the revision, which is the
one fact worth keeping), the word changes, and repeated clicking cannot flood the timeline.
**Open, for the words step**: whether the `2×` count still earns its place — under this
ruling it advertises how many times an unverifiable action was taken, which may be noise
rather than information. Jess's call, not a chat's.

**`Copy` is confirmed unchanged and needs nothing built.** It writes no business History, so
it needs no event kind, no new table, and — importantly — it is **NOT blocked by the missing
0312 / 0313 files**. The block reported earlier applied only to recording a copy, and she
ruled that away. Carry-forward `migrations-0312-0313-have-no-file-in-any-branch` therefore
blocks nothing in Phase 3 and stays a repository-governance task.

**THE STORE KEEPS ITS NAME — decided, with the reason, so it is not re-opened.** `po_sends`,
`POST /:id/sends`, `purchasing_record_send` and the wire's `sends` all say "send", which is
the very claim this entry bans. They are **not renamed**: COPY-STANDARD governs words that
appear ON SCREEN, and the portal already runs internal identifiers that may never print
(`ops_remark` is a column precisely so it cannot reach paper). Renaming a live store, a
route and an RPC to fix a word nobody sees would spend a migration — on the two objects whose
`.sql` files are missing — to change nothing an operator reads. The screen word changes; the
plumbing keeps its name and a comment records why.

### 2026-08-03 · FROZEN by Jess — the Phase 3 words, and where Communication lives

**THE DESIGN PRINCIPLE (hers, and it outranks the three words below):**

> **Communication starts from the DOCUMENT, never from the register.**

Her reason is the operator's own sequence, not another product's: *Review → Preview / Print
PDF → confirm the document is right → Communication → WhatsApp / Email.* It matches the
journey already frozen above. The consequence is long-lived: `Print PDF` · `Download PDF` ·
`WhatsApp` · `Email` (later) · `Supplier Portal` (later) all grow in **one place**, anchored
on the document — so none of them ever needs re-homing.

**THE THREE WORDS — frozen, no chat may respell them:**

| | Word | Her reason |
|---|---|---|
| 1 | **`Print PDF`** — never bare `Print` | The same place will later hold `Download PDF`, `WhatsApp`, `Email`, `Supplier Portal`. **Naming the object from day one is cheaper than renaming later.** Measured against the portal's existing spellings: `Print DO` and `Print PO` are already live elsewhere, so `Print PDF` is a THIRD spelling of one act — reported below, not resolved here |
| 2 | **`{door} opened · Revision {n}`** | `WhatsApp opened` · `Email opened` · `Supplier Portal opened` — one shape for every door, forever. **It describes the action the Portal OBSERVED, never what happened in the real world.** Her rejection of `WhatsApp action recorded`: still too technical; what the operator cares about is *when did I start sending this PO out of the Portal* |
| 3 | **`×2` KEPT, but quiet** | Right-aligned and faint. **Its meaning is not "sent twice" — it is "the same Portal action happened twice."** Her worked case: a staff member says *"I definitely pressed it again"*, and the timeline can answer *"yes, the Portal recorded the second press too."* |

**The frozen shape:**

```
[ Print PDF ]

Timeline
WhatsApp opened · Revision 1                                   ×2
2 Aug 2026 14:36
Email opened · Revision 2
```

**Words are CLOSED.** Her instruction: *"我建议停止 Words。因为再往下已经不是 wording，而是
UI."* Next is the ASCII layout, drawing only `Print PDF` · Communication (WhatsApp) ·
Timeline. Not Batch. Not Relationship Map. Not code.

**Three facts recorded with the freeze, none of them a challenge to it:**

1. **`Print PDF` is a third spelling.** The portal already renders `Print DO`
   (`OrderDetailDrawer`) and `Print PO` (`PoDetailModal`) for the same act on other
   documents. COPY-STANDARD has no ruled word for any of the three. Jess's reasoning —
   name the object because the block will grow — applies equally to those two, so the
   consistent end-state is a single ruled pattern rather than three. **Reported, not acted
   on**: renaming a live button on another page is not Phase 3's.
2. **An entry is now TWO lines** (event, then timestamp), where today it is one. With N
   distinct sends that is 2N lines of permanent height in the workspace. Stated so the ASCII
   step can show her the real cost rather than discover it later.
3. **The timestamp now carries a TIME, and the rows are COLLAPSED by day.** Same day + same
   channel + same revision renders as ONE row, so a collapsed row has several real times and
   the drawing must say which one it prints. Raised in the ASCII step.

### 2026-08-03 · Jess closed the AutoCount study

*"Study 已经够了."* No reference document is written — she refused it twice, the second time
with the reason: a doc written mid-collection becomes half-research, half-decision. The
study's findings live in the chat until an evidence set is complete.

**Two corrections she made to that study, kept because they are rulings about CARRES:**

- **`Transfer To` (the downstream document number) does NOT enter the Purchase Orders
  register.** The register answers *"what must I do with this PO today?"* — not *"what did
  this document later become."* `Received 2 / 5` stays; a GRN / Session number belongs in the
  workspace's Receiving row or in the later Relationship Map.
- **AutoCount's `View Flow` is a REFERENCE CASE, not a specification.** It draws ACCOUNTING
  documents (Invoice · AR Payment · PI · AP Payment); Carres must draw a BUSINESS JOURNEY —
  `Customer Order → (Purchase Order → Receiving | Claim)` and `→ (Delivery → Logistics |
  POD)`. The two are already different pictures.
- **The absence of a visible "sent" history in AutoCount is not evidence of an industry
  standard.** Screenshots cannot prove backend behaviour. The honest statement is: *in the
  screens collected so far, AutoCount shows no supplier-received status or timeline.* Carres's
  own rule — the Portal records only what it observed — needs no external endorsement.

### 2026-08-03 · BLOCKED, then UNBLOCKED and SHIPPED the same day

> **CLOSED AND DEPLOYED 2026-08-03.** G1 was completed (`docs/execution-queues-index.md`) — 0312 + 0313
> are in the repository and repository ↔ production parity is proved by REBUILD. Jess then ruled the
> wording forward: *"The latest ruling in this chat overrides the earlier BLOCK for this case."*
>
> **All four words shipped TOGETHER, which is exactly what this block existed to force** —
> `Copy message` · `Open WhatsApp group` / `Open WhatsApp` · `Open email` · `Snapshot N` — plus
> migration **0317**, which rewrites the `po_history` and `audit_log` sentences to
> `{Channel} opened · Snapshot N`. Without the block, `Open email` would have gone alone.
>
> **Deployment facts.** main `ed044070` (PR #571) + `b7c555a0` (PR #573, G1) · migration **0317
> applied**, tracker `20260803105141`, `md5(prosrc)` **`d42fdde8…`** reconciled byte-identical to the
> file · web **`index-C7nLHy6_.js`** (carres-portal `fdc99e25` + carres-pos `b36805f6`), all 4
> canonicals converged, live md5 **`7d67e551…`** identical to the local build, `SERVICE_ROLE` 0,
> `sent via` 0, `Revision` 0 · **Worker NOT redeployed and that is the record**: zero `apps/api`
> diff, and the only `packages/shared` diff is another lane's inert display word.
>
> **A parallel lane clobbered half the deploy mid-ship** — `index-DB7_PnR-.js` from a pre-merge tip
> landed on erp + carres-pos. Caught by DOWNLOADING that file and grepping it (`Revision` 1, none of
> the four words), never by the deployment log; rebuilt from the merged tip and redeployed. **Four
> canonicals are not a formality when two chats deploy in the same minute.**
>
> The record of WHY it was blocked is kept below, unedited.

#### The original block (kept as written)

**Her ruling, verbatim:** *"Do not query production to reconstruct missing migrations. This is
a repository governance issue, not a development task … Production is not the source of truth
for architecture."*

**What was asked and is NOT built.** Four timeline words — `Snapshot` · `Open WhatsApp` /
`Open WhatsApp group` · `Open email` · `Copy message` — plus the sentences written to
`po_history` and `audit_log`.

**Why every one of them is blocked, measured rather than assumed:**

| The word | What it needs | Where that lives |
|---|---|---|
| `Open WhatsApp` vs `Open WhatsApp group` | the send must RECORD which door was opened; the stored `channel` is `whatsapp` for both | `purchasing_record_send` (0312) |
| `Copy message` | a copy must be recorded at all; today it records nothing | a store + `purchasing_record_send` |
| `Snapshot` | a revision's own timestamp on the wire | `po_revisions` — its DDL is in 0312/0313 |
| the `po_history` sentence | rewriting what the function writes | `purchasing_record_send` |
| the `audit_log` sentence | same | same |

**`0312` and `0313` have no `.sql` in any branch**, so those objects' source cannot be read
from the repository. **A chat proposed reading them out of production and Jess refused it** —
correctly: reconstructing architecture from a running database makes production the source of
truth, which inverts the repository's whole purpose. The refusal is the durable lesson here,
not the blockage.

**The wording is left ENTIRELY unchanged, including the one word that WAS repo-supported.**
`Open email` is a pure display string and could have shipped alone — it is deliberately not
shipped, because these four are ONE vocabulary with one shape (`{door} opened`, Jess's own
rule of the same day). Renaming one of four would put two grammars on one list and would have
to be undone. **A half-vocabulary is worse than an old one.**

**What IS shipped and stays** (deployed 2026-08-03, web `index-CJzLlf_n.js` + Worker
`844ee1dd`, main `7a36f1cb`): `Print PDF`, the three bands, `{door} opened · Revision n`, the
FIRST-press rule, the quiet `×2`, and `No communication yet.` — none of them depend on a
missing file.

**Unblocked by:** governance card **G1** (`docs/execution-queues-index.md`) — restore 0312 /
0313 into the repository and verify repository ↔ production parity. **After the repository is
complete the wording changes in ONE pass**, all four words together.

---

### 2026-08-04 · LOO OPENS A PLAN CHAT FOR THIS TAB — the charter and the measured diagnosis

> Appended, not edited — §6's append-only rule. Nothing above this line changes.

**Why a second manager chat is justified, in one measurement.** Counted on prod
2026-08-04:

| | |
|---|---|
| purchase orders | **21 — every one `open`, none closed** |
| PO lines | 35 |
| lines with any goods received | **0** |
| `warehouse_receipts` / `receiving_events` | **0 / 0** |
| POs carrying `expected_ready_date` | **0 of 21** |
| POs carrying an ETA | **5 of 21** — so **16 sit in `Need Confirmation` forever** |
| `po_supplier_promises` rows | 4 |
| suppliers with an email / a WhatsApp group | **1 of 10 / 5 of 10** |

**The story those numbers tell: 21 purchase orders went IN and not one has come OUT.**

```
Issue PO            ✅  21 raised
  ↓
① supplier says when it is READY      ❌  0 of 21 — and §5/G6 already found
                                          that NO route in the portal writes
                                          `expected_ready_date`, so the
                                          `Confirm ready date` queue can only grow
  ↓
② supplier says when it ARRIVES       ❌  16 of 21 have no ETA
  ↓
③ goods received                      ❌  0 receipts, 0 events, ever
  ↓
④ PO closes                           ❌  0 closed
```

**This is not a polish backlog. Every stage after `Issue PO` is either unbuilt or
unreachable**, which is why the tab reads seven-tenths finished and behaves like a
one-way door.

**THE CHARTER — what the Purchase Orders manager chat owns, and what it may not touch.**

1. **It owns:** `docs/CHECKPOINT-purchase-orders.md` (append only) and any `Q`-cards it
   writes into `docs/purchasing-execution-queue.md` under its own heading.
2. **It may NOT edit** the To Order cards (P8 · P9 · P10), the index's ACTIVE SET, or
   `OperationToOrder.tsx` — a second planner rewriting the first planner's cards is the
   one-concern-one-file failure with two authors instead of one.
3. **Kit changes go through D0.5d, never a fork.** This tab renders through
   `DataTable`; a private table here would be the second grid the whole programme exists
   to prevent.
4. **File collision is LOW and that is measured, not assumed** — `OperationPurchaseOrders.tsx`
   (2,353 lines) shares no file with `OperationToOrder.tsx` (1,548). The overlap to watch is
   `apps/api` and `packages/shared`, where P8 also writes; different route files, so the risk
   is a rebase, not a redesign.
5. **Starting this work UNFREEZES the tab** (Phase 2 freeze, 2026-08-03). Same shape as To
   Order on 2026-08-04: the freeze stopped redesign, not completion. **The frozen layout,
   the frozen operator journey and the frozen Phase 3 words all still stand.**

> **⛔ CORRECTION BY LOO, same day — point 5's last sentence was WRONG and it is the exact
> failure CLAUDE.md's first rule exists to stop.** His words: *"but i not sure current design
> is correct or not — that's why i need new chat to review and discuss with me if got any
> better solution or idea."*
>
> The line "you add, you never redesign" quoted a frozen document as a reason to refuse a
> design. The OWNER RULE forbids exactly that: *"never uses an old rule to restrict a new
> idea … Quoting a frozen doc as the reason to refuse a design is the failure this rule
> exists to stop."*
>
> **The rule, correctly stated — it is CLAUDE.md's UI box, unchanged:**
>
> | May the chat… | |
> |---|---|
> | study the page, measure it, and judge whether the frozen design is actually right | **REQUIRED — not permitted, required.** *"The current page is Version N, never automatically final."* |
> | say the frozen layout is wrong, with evidence | **REQUIRED.** Silence is a failure |
> | propose a different design, side by side with the current one | **REQUIRED**, with evidence: current problem → operator impact → international reference → Carres adaptation → trade-off → recommendation |
> | BUILD that redesign before Loo approves it | **NO.** This is the only "no", and it was always the only one |
> | invent token values — spacing, colour, typography, icons | **NO** — those come from `01-design-tokens.md` and are not a design opinion |
>
> **What the freeze actually bought, and why it still matters:** five layout rewrites in one
> sitting produced nothing shippable. The freeze stops *rebuild-by-reflex*, not *review*. A
> chat that studies the page and proposes better is doing the job; a chat that rewrites the
> page because it felt better is the thing that was frozen out.
>
> **So this tab's plan chat has one extra duty before it writes any card:** decide, with
> evidence, whether the current design is right. If it is — say so and say why, and the cards
> only fill the gaps. If it is not — show Loo old vs new side by side and let him pick.
> *"If there is no material improvement, KEEP and say so — 'only different' is rejected."*

**A STARTING SHAPE for the cards — the manager finalises it; this is not frozen.**

| | Card | Why it is where it is |
|---|---|---|
| **Q1** | **The supplier's answer has somewhere to land** | The one card that unblocks the tab. Ready date + goods arrival are both *"the supplier told us a date"* — and **P3 already built the ledger for exactly that** (`po_supplier_promises`, 4 live rows). This is wiring an existing store to two missing write doors, not new architecture. Fixes §5's first gap AND P7's G6 in one act |
| **Q2** | **The date history reads `Confirmed / Changed`** | **Jess already designed it, 2026-08-03**, and deliberately kept it out of Phase 3: *"Do NOT fold it into a Phase 3 card."* **Zero migration, zero api change** — `recorded_at` and the answer already ride the wire. Small, and it is hers, so build it as designed |
| **Q3** | **A PO closes itself when the goods are in** | 0 of 21 closed. Carry-forward `hold-release-does-not-close-the-po` already names one path that leaves a PO open forever. Needs Q1 and real receipts first |
| **Q4** | **Supplier contact data** | **NOT a build card — it is data entry.** 1 email and 5 groups of 10 suppliers. The Communication desk cannot work without it and no amount of code fixes it. Carry-forward `supplier-contact-data-is-thin` holds the detail |

**Two things that stay closed to this chat** — both Jess's, both still true: the 50-100 line
layout stress test (**real PO only, she refuses synthetic data**; prod ceiling re-measured
2026-08-04 is still 4 lines) and any redesign of the frozen operator journey.

### 2026-08-04 · The plan chat's verdict on the frozen design, and the four cards Loo approved

> Appended, not edited. The charter's "STARTING SHAPE" table above is now FINALISED and the
> mapping is below — it said *"the manager finalises it; this is not frozen."*

**THE VERDICT LOO ASKED FOR: the structure is right, the priority is wrong. Do not redesign
the page.**

What was studied against what it does, and judged KEEP: the register/workspace split (listing
is for FINDING, the workspace is for WORKING — the same division SAP Fiori, Gmail and
Dynamics use) · `poCurrentActionOf` as ONE action source both surfaces read, so they cannot
drift (Law 7) · `poArrivalGapOf` as ONE gap rule · the product-naming function passed down so
the register and the document cannot name one item two ways · the append-only promise ledger,
which has no column to overwrite · `Print PDF` and `{door} opened · Snapshot N`, which is Law
8 correctly applied.

**The one thing that is wrong, in one sentence: the page answers *"which PO is this?"* well
and *"which PO should I touch first?"* badly.** That is a change of priority, not of shape.

**THE MEASUREMENTS THAT PRODUCED THAT VERDICT — prod + a real browser, 2026-08-04.**

| Finding | Evidence |
|---|---|
| 🔴 the riskiest PO is buried | **`PO-2038`: customer delivery date 2026-08-04 — TODAY — no supplier date, our own estimate lands 7 days late. It sits at row 8 of 21, in the same words as 15 other rows, and is neither red nor amber.** 7 POs have a customer date within 7 days and no confirmed arrival |
| 🔴 the sort is a LAW CONFLICT | `PURCHASING-WORKING-FLOW.md` §6 and `ACTION-FLOW-STANDARD.md` Law 5 both say *risk to the promise*; Jess's 2026-08-02 listing law says `PO Issued` oldest first. Both were law. **Loo ruled risk-first, 2026-08-04.** `PO Issued` keeps its column, its header sort and the tie-breaker |
| 🔴 the instruction column is the only one squeezed | `Current Action` is `width: "auto"`. Measured with the app's own stylesheet, `px-2` padding: **23px @1280 · 109px @1366 · 183px @1440**, workspace open (the default). `Waiting for Goods` needs 126px, `Confirm tomorrow's delivery` 191px, `Confirm balance delivery date` 201px. `Goods Arrival` is a fixed 192px for a 65px date |
| 🔴 a guess is painted the same red as a fact | 10 of 21 rows print a gap warning; **8 of the 10 come from OUR OWN estimate** — the factory has said nothing. Grey date, red warning, identical to the 2 rows the supplier really answered |
| 🟡 a built door with no handle | **`purchasing_record_ready_date` is live in prod (0318) with ZERO callers in the whole repo.** 0 of 21 POs carry a ready date, and no path can create one. `poDateHistoryOf` filters `kind==='tomorrow_delivery'`, so the day it is wired the history silently swallows every ready date |
| 🟡 three rail buckets are permanently zero | `Waiting Supplier Date 16 · Waiting for Goods 5 · Ready to Receive 0 · Completed 0 · Cancelled 0`. `Ready to Receive` needs `received_qty > 0` and this tab has no receiving door. The five rail words are also **not** the five ruled Operation Status labels (`Issued · In Production · Receiving · Completed · Cancelled`), and are in no dictionary — §5 already owed them |
| 🟡 no "look at the numbers" layer exists at all | All five tabs answer *what do I do with THIS document*. Nothing answers *how many mattresses this month* |

**LOO'S RULINGS, 2026-08-04:**

1. **Risk order replaces `PO Issued` as the register's default.** Overrides Jess's 2026-08-02
   listing law as the DEFAULT only; her rule survives as the header sort and the tie-breaker.
   **She is to be told once — the rule is not deleted silently.**
2. **No costing on any purchasing report.** His words: *"i dont show costing — due to supplier
   have own, finance will deal with it. If future need to add, just add, not now."* Measured
   the same day and it agrees: `purchase_order_lines.cost` is **0.00 on all 35 lines**, so a
   money column would print `RM 0.00` for everything.
3. **Purchasing gets a report layer and then a dashboard, in that order** — the dashboard is
   the report's figures made large, and computing them twice guarantees two answers.
4. **Order of play: Q1 → Q2 → Q3 → Q4**, on his instruction *"go — follow you"*. Q1 first
   because it is the only one where the page is losing work today.

**WHAT WAS RESEARCHED, so nobody re-derives it.** AutoCount's own Purchase menu draws the line
between documents (top half) and reports (`Monthly Purchase Analysis Report` · `Purchase
Analysis By Document Report` · `Top/Bottom Purchase Ranking Report`, bottom half); Odoo does
the same with a per-app `Reporting` menu; SAP Fiori and NetSuite give each ROLE an overview
page; Odoo and Linear deliberately do not, putting statistics inside the list instead. **The
condition shared by every version that works: a tile must be clickable and must land on
exactly the rows it counted.** AutoCount's ceiling is that its answer to every analysis is
*export to Excel*, and a number in Excel has left the system — that is the specific thing
Carres can beat.

**2990s IS NOT THE REFERENCE FOR THIS, and that was measured by reading their code rather
than assumed:** one global `Dashboard.tsx` (144 lines, sales counts only, no purchasing), one
cross-module `Outstanding.tsx` (8 tabs, date range), four `*DetailListing.tsx` files **all on
the sales side, and no purchase report page at all**. They copied AutoCount's grid and not
AutoCount's reports. Copying 2990s here would copy the gap.

**THE FINALISED CARDS — `docs/purchasing-execution-queue.md`, under the Q heading.**

| Card | What it is | Migration |
|---|---|---|
| **Q1** | the register puts the most dangerous PO first (+ `Current Action` fixed width, + estimate-vs-confirmed tone) | none |
| **Q2** | the factory's ready date has somewhere to land (route + button + history) | none — 0318 is already live |
| **Q3** | Purchasing gets its report tab — quantity only | none · **⛔ blocked on words** |
| **Q4** | Purchasing gets its dashboard | none · **⛔ blocked on Q3** |

**HOW THE CHARTER'S STARTING SHAPE MAPS TO THESE — stated so nothing looks lost:**

- charter **Q1** (*the supplier's answer has somewhere to land*) → **Q2**, and it is SMALLER
  than the charter thought: it is not "wiring an existing store to two missing write doors",
  because migration 0318 already shipped the whole database half. Only a route and a button
  are missing.
- charter **Q2** (*the date history reads `Confirmed / Changed`*) → **still open, deliberately
  not folded in.** It is Jess's own design and she ruled it out of Phase 3. It touches the same
  function Q2 edits (`poDateHistoryOf`), so whoever builds it after Q2 must read Q2 first.
- charter **Q3** (*a PO closes itself when the goods are in*) → **still open, and it cannot be
  started**: `warehouse_receipts` and `receiving_events` are both **0** and this tab has no
  receiving door, so there is no closing event to react to.
- charter **Q4** (*supplier contact data*) → unchanged. Data entry, not a card.

**THREE THINGS REPORTED AND DELIBERATELY NOT BUILT** (they need a ruling, not code):

1. **The rail's five words are in no dictionary** and compete with COPY-STANDARD's five
   Operation Status labels. That is a word decision — Jess's.
2. **One sofa is split across two purchase orders.** `SO-1204` · `1207` · `1208` · `1211` each
   carry one sofa build on TWO Ohana POs issued two days apart. The register cannot show that
   `PO-2031` and `PO-2040` are the same sofa for the same customer, so an operator phoning
   Ohana about SO-1204 must know two PO numbers. `PURCHASING-WORKING-FLOW.md` §3 rules that
   added items go on a NEW PO and says nothing about reading the two together afterwards.
3. **`purchase_orders.sup_status` is `pending` on all 21.** `Pending` is a banned display word
   (`01-design-tokens.md` §10, COPY-STANDARD), and the second status axis carries no
   information today.

### 2026-08-04 · Q1 SHIPPED — the register puts the most dangerous purchase order first (PR #590)

**Merge `df5fe44b` · no migration · no api change · web `index-DJiohLXa.js`, all four
canonicals on the first poll, live file md5-identical to the local build
(`2aa64d88…`, 4,750,858 bytes), `SERVICE_ROLE` 0. No Worker deploy owed and it was
MEASURED, not assumed**: `git diff 6d888325..main -- apps/api supabase/migrations` is
empty, and `apps/api` imports nothing from `po-workspace` (grep 0), so the
`packages/shared` diff reaches no api code path. `GET /health` **200 `{"ok":true}`**.

**⚠️ JESS'S 2026-08-02 LISTING LAW IS OVERRIDDEN AS THE DEFAULT, BY LOO, AND IT IS NOT
DELETED.** Her rule — *the listing is AutoCount, for FINDING; default order `PO Issued`
OLDEST first* — was law, and so were `PURCHASING-WORKING-FLOW.md` §6 and
`ACTION-FLOW-STANDARD.md` Law 5, which both say row order is *risk to the promise*.
**Loo ruled risk-first on 2026-08-04.** `PO Issued` keeps its column, keeps its header
sort, and survives inside `comparePoRisk` as the tie-breaker — a test asserts that
clicking the header still sorts by issue date and that CLEARING the sort returns to
risk order. **She is to be told once; nothing of hers was quietly removed.**

**What shipped, three things.**

1. **`comparePoRisk` / `poRiskRungOf`** — a pure function in `packages/shared`, beside
   `poCurrentActionOf` and `poArrivalGapOf`. Rungs: a LATE engine call · goods landing
   after the customer's date · landing ON it · an open call not yet late · everything
   else; then the nearest customer date (**no date sorts LAST**), then PO Issued oldest,
   then the PO number so the order is TOTAL and two rows cannot swap between renders. A
   finished or cancelled PO never rises — its gap is history, the same silence the Goods
   Arrival cell already keeps. It lives in `shared` because a comparator written inside
   the page would be a SECOND priority: the row's pill would say one thing and the row's
   position another.
2. **`Current Action` is a fixed 200px and `Items` becomes the `auto` tail.** The recipe
   is unchanged — fixed interiors, ONE auto tail — only WHICH column absorbs the slack.
3. **The gap tail's tone follows WHO gave the date**: red only when the factory confirmed
   it, amber when it is our own estimate; `same day` stays amber either way. No new word
   — the date's own tooltip already said which was which, and the colour now says it too.
   The workspace reads the same rule, so the two surfaces cannot disagree.

**WIDTHS MEASURED IN A REAL BROWSER against the app's own loaded stylesheet** (13px
Inter + `DataTable`'s `px-2`), and the measurement reproduced the card's own numbers
exactly, which is what says the model is right:

```
Current Action, when it was `auto`      1280 → 23px · 1366 → 109 · 1440 → 183 · 1920 → 663
the words that must fit                 Confirm Arrival 109 · Open Receiving 113 ·
                                        Contact Supplier 119 · Waiting for Goods 126 ·
                                        Confirm what happens next 186 ·
                                        Confirm tomorrow's delivery 191 ·
                                        Confirm balance delivery date 201
after                                   200px at every viewport
Items (the tail), compact               1280 → 0 · 1366 → 49 · 1440 → 123 · 1920 → 603
Items (the tail), expanded              1280 → 24 · 1366 → 77 · 1440 → 151 · 1920 → 631
```

**REPORTED, NOT HIDDEN — one measured regression at exactly 1280.** The compact fixed
sum moves 424 → 484, so the LISTING REGION's horizontal-scroll threshold moves from a
**1257px viewport to a 1317px** one: at 1280 the region gains **37px** of horizontal
scroll (`scrollWidth` 484 vs `clientWidth` 447) where today it has none and a 23px
`Current Action`. The region already answers *"the columns do not fit"* with a
horizontal scroll by its own design (`min-w-[880px]` in expanded mode, and its comment
says so), and the ruling's own principle prefers a readable instruction to a deleted
one — so 200px shipped as ruled and the number is on the record rather than the ruling
being quietly softened. If Loo wants the 1280 case back it is one number, not a redesign.

**VERIFIED AGAINST PRODUCTION DATA before the deploy** (read-only SQL over the live 21
POs, the live production-day settings and the live promise ledger), and it reproduces
the card's own measurements independently:

- **10 of 21 rows print a gap warning and 8 of the 10 are our own estimate.**
- **`PO-2038` is row 1** — Nice Future, issued 1 Aug, the factory has never given a date,
  our estimate 11 Aug against a customer date of **4 Aug**: an **amber `7d late`**. It was
  row 8 of 21.
- **`PO-2031` and `PO-2032` are the only two RED gaps on the page**, both `8d late`, both
  from a date the factory itself gave.
- **Zero open engine calls exist today** — every `eta_date` is beyond tomorrow — so rungs
  1 and 4 are empty on live data and rung 2 leads. First eight: `PO-2038 · PO-2037 ·
  PO-2039 · PO-2048 · PO-2031 · PO-2040 · PO-2032 · PO-2041`.

**Gates:** web tsc 0 · `OperationPurchaseOrders` **51 → 62** · `po-workspace` **23 → 30**
· shared 2076/2076 · full web suite 16 pre-existing (§17.7), ZERO new · **check-design
8368, byte-identical, proved by linting the tree WITHOUT the change** · build clean.
**Four negative controls, each run as a REAL edit and each verified to have applied
before its run was believed**: remove rung 1 → shared 2 + web 3 · remove the tone split
in the register → 1 · in the workspace → 1 · `Current Action` back to `auto` → 2.

**Proved on the downloaded bundles, both directions**: `"confirmed":"estimate"` greps
**0** in the predecessor (`index-DiTy2SJk.js`, fetched from its OWN deployment URL —
a superseded asset 404s at the apex) and **2** here; and the bundle carries the widths
literally — predecessor `Current Action",width:"auto"` + `Items",width:"150px"`, live
`Current Action",width:"200px"` + `Items",width:"auto"`. **`data-tone` is NOT a clean
marker and saying so is the method note**: it greps 2 in BOTH bundles, because the order
journey-health strip and the order-action row already used it; the delta is 2 → 4.

**One test change worth knowing about:** the row that auto-selects is now the most
DANGEROUS PO rather than a fixed one, so six page tests that silently relied on the
default selection now say which PO they are about (`openPo(id)`). That is the honest
consequence of the ruling, not a fixture bent to avoid work.
