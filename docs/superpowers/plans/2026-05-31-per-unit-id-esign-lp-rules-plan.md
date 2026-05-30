# Plan — per-unit SKU ID + customer e-sign + LP rule fixes

> Date: 2026-05-31 · Phase 10 · Author: Claude (Opus 4.8)
> Source investigation: workflow `wf_937a4e2c-d47` (4-track, 2026-05-31)

## Decisions locked (Loo, 2026-05-31)

1. **per-unit ID minted at PO-open** (`id-abc123456` = `id-` + 3 lowercase letters + 6 digits).
2. **customer e-sign REQUIRED** to mark-delivered (keep typed name + photo). Both partner leg AND HQ/operation leg.
3. **STANDARD goods auto-dispatch** on warehouse arrival using the LP pre-chosen at Accept (supersedes migration 0122's manual gate, now that 0147 forces LP selection at Accept).
4. **Reject flow upgraded**: active notification (counter, not passive badge) + branch on whether goods are at the warehouse (A.3 vs A.4).

## Investigation findings (grounding)

- `ops_stock_items` (migration 0137) already = one row per physical unit (67 live at Carres Klang: 51 free / 16 reserved / 0 sold). Has reserve/release/reassign/takeout/flag_repair RPCs + API (`/ops/stock`, 9 endpoints) + 4 web pages (Ready/Reserved/Repair/Inventory). **id is a random UUID, not the requested format. Units are minted ONLY by the one-time 0137 seed — the live PO-open / receive / deliver RPCs never touch this table.**
- Two stock systems coexist and are NOT reconciled at receive: aggregate `stock_balances`/`stock_movements` (what receive RPCs write) vs per-unit `ops_stock_items` (seed + manual). `ops_rollup_stock_balances(wh)` OVERWRITES `stock_balances` from `ops_stock_items`. → **double-count risk** if we mint per-unit at receive AND keep `stock_balances += qty`. For Klang, per-unit table must become the single source of truth.
- e-sign: nothing exists in delivery; only a hollow "signed" boolean. A working `SignaturePad.tsx` (canvas → PNG dataURL) exists in dealer/new-order to reuse. Private `proof-of-delivery` bucket exists (migration 0069). Two mark-delivered RPCs: `partner_attach_pod` (0070/0088) + `operation_attach_do_and_deliver` (0087-era `logistics_attach_do_and_deliver`, post-rename).
- LP rules: A ✅ (0147 forces customer LP at Accept), A.1 ✅ (kind-gated procurement LP), A.2 ⚠️ (only SOFA_SPECIAL auto-dispatches; STANDARD stops at `ready_to_dispatch` per 0122), A.3/A.4 ⚠️ (`lp_reject_order` exists + Reselect UI, but single path, no warehouse branch, passive badge). Two reject mechanisms coexist (`lp_reject_order` order-level + `partner_reject_customer` PO-level) — confusion source.
- Nice Future PO split = NOT a current-code bug. Universal-split (commit `c134dec`, 2026-05-18) was reverted to sofa-only (commit `2514362`, 2026-05-22) + refined (`516edfc`, 2026-05-23). Live PO-2031 (5/23) is correctly consolidated (so_refs=[1117,1118]). **Live deploy likely stale.** Nice Future = mattress-only (sofa = Ohana).
- Latent edge: sofa-split gate is supplier-level (`cat_covered.includes('sofa')`), so Ohana bedframe (Ohana covers bedframe+sofa) wrongly splits despite SOP_STANDARD.

## Work items (ordered by risk/benefit)

### A — Redeploy live (fixes Nice Future) · 0 code
- Verify the live `carres-portal.pages.dev` bundle git SHA. If < `2514362`, redeploy current HEAD.
- Acceptance: a fresh Nice Future PO spanning ≥2 SOs lands as ONE PO; an Ohana sofa PO still splits per fabric.

### F — Ohana bedframe split fix · client only
- `CreatePOModal.tsx:788`: change `isSofaSupplier` (supplier-level) to a per-LINE category test (`categoryForSku(l.sku)==='sofa'`), matching autoFill's per-line logic at line 557.
- Acceptance: Ohana bedframe lines consolidate into one PO; Ohana sofa lines still split per (SO,sku,attrs).

### E — customer e-sign (REQUIRED) · migration + RPC + UI
- New migration: add `signature_path text`, `signer_name text`, `signed_at timestamptz` to `order_supplier_threads` (per-line, per 0124) and mirror onto `orders` header for the HQ path.
- Widen `partner_attach_pod` + `operation_attach_do_and_deliver` to accept + require signature path + signer name; raise if missing.
- Reuse `SignaturePad.tsx` (lift to shared, swap disclaimer copy to delivery-receipt). Mount in `PODUploadDialog.tsx`; gate Mark-delivered submit on signature + name.
- Upload PNG to existing `proof-of-delivery` bucket as `{thread_id}/{uuid}-signature.png`.
- Acceptance: cannot mark delivered without a captured signature; signature renders in the order/POD drawer.

### B — A.2 STANDARD auto-dispatch · migration
- `partner_pickup_threads` + `operation_receive_threads`: extend SOP CASE so STANDARD goods, when the order already has a `delivery_partner_id` (set at Accept via 0147), advance to `dispatched` on warehouse arrival instead of stopping at `ready_to_dispatch`.
- Keep manual `operation_assign_partner` as a fallback if (defensively) no LP was pre-chosen.
- Add regression guard (closes `phase-10-partner-pickup-rpc-regression-guard`): assert the SOP CASE is present in `pg_get_functiondef`.
- Block comment must document the 0122→here behavior change (LP now pre-chosen at Accept makes auto-dispatch safe).
- Acceptance: STANDARD mattress order with LP chosen at Accept → auto `dispatched` on receive, no manual step.

### C — Reject upgrade (A.3/A.4 + notification) · migration + API + UI
- Branch `lp_reject_order` on warehouse state:
  - A.3 (goods at WH, stage ≥ ready_to_dispatch/dispatched): revert `operation_stage` to `ready_to_dispatch`, clear `partner_accepted_at`, flag for reselect.
  - A.4 (goods not yet at WH): leave stage unchanged, flag for reselect.
- Active notification: write to `user_nav_seen`/badge counter for the operation role on reject (reuse 0083 badge infra) instead of relying only on the passive red badge.
- Consolidate the two reject mechanisms — pick `lp_reject_order` (order-level) as canonical; deprecate/route `partner_reject_customer` (PO-level) or document why both stay.
- Acceptance: partner reject raises an operation badge count; A.3 reverts to ready_to_dispatch; A.4 leaves stage; Reselect works for both.

### D — per-unit ID (PO-open mint) · migration + 4 flow hooks + UI
- New migration:
  - Add `unit_code text UNIQUE` to `ops_stock_items` (the `id-abc123456`); keep uuid PK (all 9 endpoints + UI use `r.id`).
  - Generator function `gen_unit_code()` → `id-`+3 random lowercase letters+6 digits, retry-on-unique-violation; enforce UNIQUE.
  - Add `'incoming'` to the `status` CHECK (PO opened, not yet arrived). Lifecycle: incoming → free → reserved → sold (+ damaged/repair/transferred).
  - Add `sold_at timestamptz`.
- Hook 1 — PO-open (`_operation_create_po_inner`): per line, INSERT `qty` rows status='incoming', unit_code=gen, sku/supplier/po_no/warehouse_id/source_ref. Use `unit_code` as the audit_log ref.
- Hook 2 — warehouse receive (`operation_receive_threads` / `operation_receive_po_with_do`): flip this PO's `incoming` units (matching sku, up to received qty) → 'free', then `ops_rollup_stock_balances`. **For Klang, drop the manual `stock_balances += qty`** (per-unit table is truth) to avoid double-count.
- Hook 3 — PO cancel (`operation_cancel_po`): void the PO's `incoming` units (clean up phantom IDs).
- Hook 4 — sale linkage (`operation_attach_do_and_deliver`): flip the order's reserved unit(s) (reserved_ref = order ref) → 'sold' + `sold_at=now()`. **(pending Loo confirm: auto sale-linkage)**
- UI: surface `unit_code` in the 4 ops-stock pages + a per-unit audit view (filter audit_log by unit_code).
- Acceptance: opening a PO mints N `id-abc123456` rows (status incoming); receiving flips them to free with no stock_balances double-count; cancelling voids them; delivering an order with reserved units marks them sold with date; audit_log traceable by unit_code.

## Migrations (all NEW; never edit committed migrations)

| Item | Migration content |
|---|---|
| E | threads + orders signature columns; widen 2 attach RPCs |
| B | rewrite partner_pickup_threads + operation_receive_threads SOP CASE; regression guard |
| C | branch lp_reject_order; notification write; reject mechanism consolidation |
| D | ops_stock_items unit_code + sold_at + 'incoming' status; gen_unit_code(); patch operation_create_po/_inner + receive + cancel + attach_do_and_deliver |

## Risk notes
- Items B/C/D all touch the dispatch/stock state machine which has 0117/0118/0122 regression history → heavy testing + regression guards.
- Item D dual-stock reconciliation is the highest-risk change; do it last, Klang-only (the only active warehouse).
- All schema + SECURITY DEFINER function changes require Loo's explicit in-conversation approval (CLAUDE.md §7 + §8 + global red lines).

## Test gates per item
- Unit (vitest) for adapters/schemas; integration (msw) for new/changed routes; live MCP smoke against staging=prod for each migration; regression guards for B/C/D.
