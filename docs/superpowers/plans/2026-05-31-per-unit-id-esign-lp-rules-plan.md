# Plan — per-unit SKU ID + customer e-sign + LP rule fixes

> **STATUS 2026-05-31: F + E + B + C + D all DONE & committed.** Migrations
> 0151 (e-sign) · 0152 (auto-dispatch + reject) · 0153 + 0154 (per-unit ID)
> applied to live DB. Branch `phase/10-per-unit-id-esign-lp-rules`:
> 93106ad (F) · 4d968a8 (E) · dd4432f (B+C) · 1087f08 (D).
> typechecks shared+api+web clean. Full suite: shared 186/186, api 687/690,
> web 464/469 — all 8 fails pre-existing per §17.7 (OhanaSofaTab kanban ×5,
> supplier/pos ×2, pickups ×1); git diff proves my commits never touched
> those files. **ONLY ITEM A (Cloudflare deploy) REMAINS** — deliberately
> last so all 5 ship in one deploy. NOT yet deployed → Nice Future fix is in
> code but not yet live until deploy.

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

## Execution state (2026-05-31)

Branch: `phase/10-per-unit-id-esign-lp-rules` (off main HEAD 52f7b9a).

- ✅ **F DONE** — commit `2da7d3c`. `CreatePOModal.tsx` issuanceGroups now splits per-LINE sofa category (was supplier-level). typecheck clean, CreatePOModal 19/19.
- ⏳ **A** — defer the actual Cloudflare Pages redeploy to the very end so all fixes ship in one deploy. Web deploy = manual `wrangler pages deploy dist --project-name carres-portal` (no git-triggered CI). Live bundle is likely pre-`2514362` (the Nice Future symptom); current HEAD already has the fix.
- 🔜 **E — refined design (ready to build):**
  - DB facts (verified live via MCP): `order_supplier_threads` ALREADY has `pod_signature_path text`, `pod_signed_by text`, `pod_signed_at timestamptz` (plus pod_url/pod_do_number/pod_note/pod_uploaded_at/pod_uploaded_by/delivered_at). `orders` has `pod_signed bool`, `pod_signed_at`, `pod_signed_by`, `do_file_path`, BUT **no `pod_signature_path`** → only orders needs that column added.
  - Two RPCs to widen (no SQL dependents — `[]`): `partner_attach_pod(p_thread_id uuid,p_po_id text,p_do_number text,p_do_note text,p_signed boolean,p_do_file_path text)` and `operation_attach_do_and_deliver(p_order_id uuid,p_do_number text,p_do_note text,p_signed boolean,p_do_file_path text)`.
  - **Zero-downtime rollout**: drop old sig, recreate with 2 NEW trailing params `p_signature_path text default null, p_signed_by text default null` (defaults keep the stale live bundle's 6/5-arg calls working). Store pod_signature_path + pod_signed_by + pod_signed_at when provided. Required-ness enforced at UI + API (zod), not the RPC (RPC hard-guard deferred to a cleanup migration after old bundle is gone).
  - partner_attach_pod body: SECURITY DEFINER, verifies `v_thread.delivery_partner_id = auth.app_partner_id()`, idempotent on `operation_stage='delivered'`, UPDATE then `perform _recompute_order_logistics_stage(order_id)`.
  - operation_attach_do_and_deliver body: SECURITY DEFINER, UPDATE orders set operation_stage/status='delivered' + do_* + pod_signed + pod_signed_at.
  - Files: web `apps/web/src/pages/partner/components/PODUploadDialog.tsx` (replace `signed` checkbox with SignaturePad + signer-name input; gate `canSubmit` on both), `apps/web/src/lib/storage.ts` (`uploadDeliveryFile` → add a `kind:'pod'|'signature'` variant; sign-upload path `{thread}/{uuid}-signature.png`), `apps/web/src/lib/api.ts` (thin fetch wrapper — `api.partner.pod.signUpload`/`.attach`; PROXY/dynamic — needs the construction read to confirm whether call-site fields auto-forward), `apps/web/src/pages/operation/components/AttachDoDeliverModal.tsx` + `apps/api/src/routes/operation/orders.ts` (HQ path, ~line 612), `apps/api/src/routes/partner/pod.ts` (attachSchema + sign-upload kind).
  - SignaturePad reuse: `apps/web/src/pages/dealer/new-order/SignaturePad.tsx` (canvas → PNG dataURL via `toDataURL`). Lift to a shared dir + add an optional `caption`/disclaimer prop (current hardcoded "agrees to the terms below" is wrong for delivery). Convert dataURL→Blob→File for upload.
  - Tests: `apps/api/.../partner/pod.test.ts`, operation orders test, PODUploadDialog test if present.
- 🔜 **B/C/D** — as specified above; all via Supabase MCP `apply_migration` (reliable) + chunked Reads for code (Grep is unreliable this session — use PowerShell Select-String→file→Read or chunked Read instead).

**Tooling note (this session):** Grep returns blank/garbled; terminal stdout garbles (route to file + chunked-read); large/offset Reads intermittently garble (use small `limit`). MCP + Edit + small Reads are reliable. A fresh session typically resets this.
