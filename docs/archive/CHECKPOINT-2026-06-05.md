# Checkpoint — end of 2026-06-05 session

Loo asked for this so the next chat picks up clean. Read this first, then
`CLAUDE.md` for project rules.

---

## Live state (verify before changing anything)

| Layer  | URL / Version |
|--------|---|
| Web (Pages) | `https://carres-portal.pages.dev` · bundle `index-DNYl_-jY.js` |
| API (Worker) | `https://carres-portal-v2-api.wwch.workers.dev` · version `1974bdea-bdbc-49d1-93d5-3cbef04ffb70` |
| Supabase | project `kfprgpjpaffedghytstl` · latest migration **0158** |
| Logistic partners | **8 total, all all-caps short codes** — `AL · EU · HOUZS · NETS · SSY · TEOW · TSDD · TT` |

---

## What shipped today (chronological)

1. **AutoCount import bugfix** (PR series) — Loo's 192-row `listing 4 jun
   26.csv` was being killed by a single discount row with blank `Item Group`
   + a supabase-js bug that silently dropped catalog matches when descriptions
   contained `"`. Now ships 4-layer SKU resolver:
   - Layer 1: exact match
   - Layer 2: color-strip (drops `/Col:NINJA-02`, `/M2402-4 Sand`, etc.)
   - Layer 3: model-family (same model identifier, best-seater fit)
   - Layer 4: model-token (drops width too — catches `SF03-HK5535/32"` when
     catalog only has `/24"` + `/30"` widths)
   - Real-world recovery rate on Loo's listing: **24/109 → 106/109**
2. **4 new logistic partners** (migration 0155) — Teow, TT (KL→JB), EU, SSY
   (JB→SG). Then renamed to **TEOW** for ALL-CAPS consistency (0158).
3. **NETS rename** (migration 0157) — `Nets Sdn Bhd` → `NETS` to match
   short-form convention. Also updated 4 code/test/seed references.
4. **Multi-leg delivery chain (γ architecture)** — the big one:
   - Schema (migration 0156): `orders.delivery_stops jsonb` + GIN index +
     2 SECURITY DEFINER RPCs (`set_delivery_chain`, `patch_delivery_stop`)
   - Backend API: `PUT /api/operation/orders/:id/delivery-chain` +
     `PATCH /api/operation/orders/:id/delivery-stops/:leg`
   - Shared contract: `packages/shared/src/schemas/delivery-chain.ts`
   - Frontend UI: `apps/web/src/pages/operation/components/DeliveryChain.tsx`
     mounted in Order detail drawer. Single-leg shows compact pill +
     "Set up multi-leg route" CTA; chain view shows vertical timeline +
     per-leg action buttons + inline notes editor + "+ Add another leg" form.
5. **Stock alerts tab routing fix** (PR #12) — closes CF
   `phase-4.5-chunk-2-alerts-tab-routing`. StockAlertsTile + OperationWarehouse
   now use the tab-state callback instead of a bare URL navigate.

---

## Pending / Not yet tested

- **Multi-leg E2E live test** — Loo was about to walk through the 9-step
  flow when this checkpoint was created. If he reports breakage, that's the
  first place to look.
- **POD upload per leg** — intentionally deferred to V2. Operation can put
  handoff context in the inline `notes` field for now. Bucket RLS for
  per-leg POD paths (`delivery-orders/orders/<id>/legs/<n>/<ts>.<ext>`) needs
  verification before frontend uploads via supabase-js. (Status field
  exists in schema, `pod_url` + `pod_signed_by` ready for V2 wiring.)

---

## Known stale docs (cleanup tasks for the next session)

`CLAUDE.md` is severely out of date — multiple sections need a catch-up:

- **§17.1** says latest migration is `0154`; actually **0158**. Also says
  test count `api 692/695 · web 464/469` — re-measure after today's adds:
  delivery-chain.test.ts adds 16, OperationOrders fixture updated, web
  StockAlerts/Dashboard/Warehouse tests modified.
- **§17.3 work-log** is missing today's entries — should add 1 entry per
  PR (or one consolidated 2026-06-05 entry).
- **§17.5 carry-forwards** — add new ones from today (see below).
- **§17.6 known risks** — partner names normalised; can update.

New carry-forwards to add (low/medium priority):

- `phase-10-multi-leg-pod-upload` (MED) — frontend Storage upload + RLS for
  `delivery-orders/orders/<id>/legs/...` paths so partners can attach POD
  photos per handoff.
- `phase-10-smart-partner-suggest` (MED) — Inbox dropdown should
  auto-recommend partner from customer's delivery state (Klang→NETS,
  Johor→TEOW/TT, Singapore→EU/SSY). Right now operation picks manually.
- `phase-10-orders-partner-filter-chip` (LOW) — Orders kanban needs
  `[All] [NETS] [TEOW] …` filter chips so operation can see "all single-
  partner X orders" the way the spreadsheet had per-partner tabs.
- `phase-10-stock-indicator-on-order-card` (LOW) — Order kanban cards
  should show 🟢/🟡/🔴 stock indicator inline so operation doesn't have to
  open every drawer.
- `phase-10-multi-leg-promotion-decision` (LOW, watch for 3 months) — γ
  jsonb design assumes <30% of orders are multi-leg. Track ratio in
  production; if it crosses 30%, promote to first-class `order_delivery_legs`
  relational table (β architecture). The jsonb shape mirrors the relational
  shape so backfill is one `INSERT … SELECT`.

---

## How to start the next chat

1. Open Claude Code in `C:\Users\User\OneDrive\Desktop\Carres-Portal v2`
   (same folder — parallel-dev is OFF for now, Loo wants single-session).
2. First message:
   > Read `CLAUDE.md` (project rules) then `docs/CHECKPOINT-2026-06-05.md`
   > (last session's wrap-up). Confirm the live state matches, then pick up
   > from the "Pending" + "Known stale docs" sections.

The new chat starts cold — no memory of today's back-and-forth. The
checkpoint plus CLAUDE.md is everything it needs.

---

## Pre-existing test fails (don't chase as regressions)

Per CLAUDE.md §17.7:

- **api**: `partner/pickups.test.ts > returns LP's POs` (1)
- **api**: `supplier/pos.test.ts > GET /api/supplier/pos/:poId/threads` (2)
- **web**: `HoOKkASofaTab.test.tsx` (4 fails — Direct-receive escape hatch)
- **web**: `NiceFutureMattressTab.test.tsx` (1 fail — pre-existing,
  verified via stash-test earlier today)

If the next session sees these, they're pre-existing. Don't bisect on them.
