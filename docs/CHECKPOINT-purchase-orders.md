# CHECKPOINT — Purchasing · Purchase Orders (Supplier Execution Register)

> **Handover, 2026-08-02 session end.** The next chat CONTINUES an unfinished page.
> Jess's own words for the state: half-done, corrections pending. Read this whole
> file, quote her rules back in ONE line, execute §2 FIRST, then wait for her.

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

**STEP 2 · LIVE PURCHASE ORDER — NEXT, and it is an IA FREEZE, not a header
patch.** Her words: the right pane is NOT a PO preview. Delete the CARRES
wordmark + "PURCHASE ORDER" letterhead (the paper look belongs to the printed
0307 document). Then freeze the IA: which sections exist · each section's
mission · what is editable · what is forever read-only · what belongs to
Receiving. Every block answers *what does this help the operator DO* (update
supplier progress · communicate · hand to Receiving) — a block that only shows
data gets cut. ASCII → her yes → build. From 2990s only three copies are
approved: `(revised)` ✅ · cancelled-grey ✅ · plain-words error messages (owed
to Phase 4's refusals).

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
  Sales Order stacked list on merged POs · **Goods Arriving At auto-default** =
  placed_at + production days on the supplier's own week (0303 settings; no setting →
  no default, P1's law; grey = expected, ink = supplier-confirmed) · Received + Open
  Receiving · engine calls list · **Communication desk** (WhatsApp draft from live
  data + Copy + Open group via `suppliers.whatsapp_group_url`).
- Print PDF REMOVED on purpose: the old `po-template.tsx` prints money, violating
  PO-PDF-STANDARD §2. The real renderer wires to 0307 `purchasing_po_document` —
  its own card. Never re-add the old button.

## 4 · GATES (state at handover)

web tsc 0 · api tsc 4 pre-existing (`rental-sell.test.ts`) · check-design 8440 total
with **I +3 over baseline — verbatim To Order class copies** (the copy-the-master vs
§6.6 conflict; reported to Jess, resolves at shell extraction; do not "fix" by
reshuffling classes) · design-standard gate ✓ · OperationApp routing tests 8/8.
The page has NO test file of its own yet — the next build slice should start one.

## 5 · KNOWN GAPS (report, never silently build)

- Supplier "confirm Goods Arriving At" WRITE door (promise ledger kind `arriving`) —
  without it Waiting Goods stays 0 forever. The next real slice after §2.
- Missing stores: `po_sends` (I've Sent + history) · `suppliers.email` · PO notes ·
  supplier DO number/file. Per-line SO attribution = P5 allocation (accepted).
- Words owed to COPY-STANDARD: section titles · work-state names · `PO Issued` ·
  Communication desk words · the grey-date tooltip.
- ETA-model reminder: Loo froze "settle after real POs" — Jess overrode 2026-08-01
  (ledger = only write door). Recorded; optional Loo sign-off is her call.
