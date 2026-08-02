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

## 2 · HER LAST TWO RULINGS — EXECUTE FIRST, they arrived as the session died

**① Listing columns, FINAL (replaces the current 8):**
```
PO No. · Supplier · PO Issued · Goods Arriving At · Received · Current Action
```
- `Customer Delivery` LEAVES the listing (currently 2nd — remove).
- `Issued Date` renames to **`PO Issued`** and moves from 1st to 3rd. Her why, keep it
  in the code comment: it is the official date the supplier receives the PO · it starts
  the supplier lead time · it matches the PDF · operators say "the PO we issued last
  week", never "the record we created".
- `PO Issued` ▼ = Today · Yesterday · This Week · Last Week · This Month · Last Month ·
  month buckets (Jan 2026, Dec 2025 …) · **Custom Date Range…** ← the preset machinery
  exists (`arrivingMatches` + `dateOptionsFor`); Custom Range needs a small two-date
  popover the kit ColumnFilter does not have — build it or propose the shape first.

**② The workspace panel stops pretending to be paper:**
- Her words: *"we said no pdf view but it a concept to fill up detail — stupid to show
  carres logo and wasting space — never think this panel what can help us."*
- DELETE the CARRES wordmark + "PURCHASE ORDER" letterhead decoration from the panel.
  The PDF-standard look belongs to the PRINTED document (the 0307 renderer card),
  not to this working panel.
- Rebuild the panel top as a WORKING header: PO number · supplier · Supplier Progress
  status · the dates — dense, zero ceremony. Then ask of every block: *what does this
  help the operator DO?* (her three actions: update supplier progress · communicate ·
  hand to Receiving). A block that only "shows data" gets cut. Sketch ASCII → her yes
  → build.

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
