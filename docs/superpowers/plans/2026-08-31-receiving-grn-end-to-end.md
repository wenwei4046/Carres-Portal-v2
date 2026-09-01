# Receiving / GRN End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every behaviour change and `superpowers:verification-before-completion` before any completion claim. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current ambiguous Goods Received queue with one governed `Receiving` Register and one persistent Receiving Session that can be counted by Warehouse/showroom staff, posted once by GRN authority, found by a stored formal GRN number, and projected into central Work without duplicating PO, Stock, Claim or Return truth.

**Architecture:** Manual Purchase and SO Batch Purchase remain upstream demand doors and are read-only to this task. Their one Purchase Order authority supplies the source version, supplier, destination, ordered balance, Unit IDs and supplier promise facts. Office and Warehouse entrances save the same `warehouse_receipts` session shape. A single security-definer `post_receiving_session(uuid, integer)` function locks and validates the session, resolves normal GRN Duty/cover/actual actor, allocates the stored document number, calls the existing stock consequence once, and appends the event ledger. The API exposes one Receiving projection; the web uses the approved Shell, `register/DataGrid`, `FilterRail`, `GoodsMiniTable`, Object Detail and central Work engine.

**Tech Stack:** PostgreSQL/Supabase migrations, TypeScript, Zod, Hono, React Query, React, Vitest, Playwright.

**Authority:** `docs/superpowers/specs/2026-08-31-receiving-grn-owner-approved-design.md`; `docs/receiving/MASTER.md`; `docs/purchasing/MASTER.md`; `docs/stock/MASTER.md`; `docs/ui/MASTER.md` (§1.3, §4, §5 and §6.5–6.7); `docs/COPY-STANDARD.md`. `docs/UI-DICTIONARY.md` and `docs/UI-KIT.md` are retired and are not authorities.

**Delivery states:** Report `authority/design aligned`, `code implemented and integrated`, and `production deployed/verified` separately. This plan authorises no production migration. Production application requires the repository's governed migration approval after CI.

**ERP MASTER PAGE CONTROL seam received 2026-08-31:** Purchase Orders and Receiving use one ERP Shell. Register rails contain business facts only; the central My Work / Team Work engine is the sole complete queue. Selection replaces the same top Work Toolbar row and owns `Start Receiving` / `Open Receiving`; outputs remain separate and there is no bottom action bar. Counts distinguish filtered records from quantities. Normal duty, dated cover, actual actor and object PIC remain separate structured metadata. Acceptance includes stable exact deep-links, browser/API/RLS/SQL permission parity, desktop and genuine sub-1280 walks, merged ancestry and exact deployed SHA. The control-task drift evidence belongs in `docs/ui/PAGE-CONTROL-AUDIT.md` when that file lands; this plan does not create a competing copy.

## Non-negotiable boundaries

- Navigation/page/register is `Receiving`; the posted transaction is `Goods Receipt`; the official document is `GRN` / `GOODS RECEIPT NOTE`.
- A draft/submitted session has no GRN number. Successful posting stores one `GRN-YYYYMMDD-RRRR`, where the date is the Malaysia posting date, not `Goods Received At`.
- Only valid `Received Qty` increments PO received quantity and available Stock. Damaged, Wrong Item and Extra quantities neither reduce Pending Delivery Qty nor enter available Stock.
- Partial receipt never silently completes the PO. Pending Delivery Qty remains an open source fact.
- Unit IDs are allocated by the PO/CO authority. Receiving validates them and never mints replacements.
- PO Duty owns supplier promises and evidence; this task consumes those facts and does not edit the Purchase Orders page or add a promise writer.
- Work projects open facts and deep-links. It never supplies a manual `Done` mutation, and Receiving has no local Work panel or Work column.
- The full Register has no enclosing outer border. Keep the toolbar bottom divider, table grid lines and footer top divider.
- Current production has no live Consignment Order writer. Build one source-adapter contract and ownership-preserving tests now; activate CO intake only when the governed CO source exists. Do not invent a CO table or second order writer in this task.
- Historical plans `2026-08-29-goods-receipt-and-formal-grn.md` and `2026-08-29-receiving-continuations.md` are superseded and must not be executed.

---

## Task 1: Freeze the shared Receiving contract with failing tests

**Files:**
- Modify: `packages/shared/src/warehouse-receipt.ts`
- Modify: `packages/shared/src/warehouse-receipt.test.ts`
- Modify: `packages/shared/src/schemas/warehouse.ts`
- Modify: `packages/shared/src/schemas/operation.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/jump-to.ts`
- Modify: `packages/shared/src/jump-to.test.ts`

- [ ] Replace derived-number tests with tests proving a draft has `grnNumber: null`, a posted row must carry the stored number, and parsing accepts only `GRN-YYYYMMDD-RRRR`.
- [ ] Add failing quantity tests for full, partial, damaged, wrong, extra and zero-count sessions. Assert only `receivedQty` reduces pending.
- [ ] Add failing Unit ID tests for duplicate, missing, wrong-source and unexpected IDs. Assert no helper allocates an ID.
- [ ] Add the exact wire/domain contract:

```ts
export type ReceivingSourceKind = "purchase_order" | "consignment_order";

export interface ReceivingLineInput {
  poLineId: string;
  sku: string;
  receivedQty: number;
  damagedQty: number;
  wrongItemQty: number;
  extraQty: number;
  unitIds: readonly string[];
  damagedPhotos: readonly string[];
  wrongItemPhotos: readonly string[];
  extraEvidence: readonly string[];
  wrongItemReason: string | null;
}

export interface ReceivingSessionInput {
  sourceKind: ReceivingSourceKind;
  sourceId: string;
  expectedVersion: number;
  supplierDoNo: string;
  signedDoPath: string;
  goodsReceivedAt: string;
  note: string | null;
  lines: readonly ReceivingLineInput[];
}

export interface ReceivingQuantities {
  orderQty: number;
  receivedQty: number;
  damagedQty: number;
  wrongItemQty: number;
  extraQty: number;
  pendingDeliveryQty: number;
}
```

- [ ] Make `warehouseReceiptProblems` return stable problem keys and map them to the Owner-approved two-line copy. Keep the fact and action as separate fields, never concatenate avatar/owner metadata into either sentence.
- [ ] Keep a read-only compatibility mapper for historical `received_now` payloads. New save/submit requests must use the new fields.
- [ ] Remove new-call use of `receivingRecordNo`; keep only a clearly named historical display fallback until every pre-migration posted record receives a stored legacy number.
- [ ] Run `pnpm --filter @carres/shared test -- src/warehouse-receipt.test.ts src/jump-to.test.ts`; expected: the new tests pass.
- [ ] Commit: `git add packages/shared && git commit -m "test(receiving): lock the receiving session contract"`.

## Task 2: Persist source snapshot, formal GRN identity and actor context

**Files:**
- Create: `supabase/migrations/0406_one_receiving_session_posts_one_formal_grn.sql`
- Modify: `scripts/check-migrations.mjs` only if an existing migration-law test exposes a real naming-rule gap; otherwise leave it unchanged.

**Migration filename law:** this plan originally reserved `0406` on `origin/main` SHA `fe1e6780`. Current main `c35adc60` later claimed `0406`, so the still-unapplied Purchasing pair is renumbered to `0407` for supplier answer/PO and `0408` for Receiving/GRN. The collision was resolved before either file was applied. Never rename an applied migration.

- [ ] Start the migration with `begin;` and end with `commit;`; include comments saying no production apply is authorised.
- [ ] Add immutable/session columns to `warehouse_receipts`: `source_kind`, `source_id`, `source_version`, `source_snapshot`, `destination_snapshot`, `supplier_snapshot`, `grn_number`, `grn_posting_date`, `normal_grn_duty_user_id`, `grn_cover_user_id`, `post_authority`, `lock_version`, `amended_at`, and `voided_at`. Backfill existing rows as `purchase_order` sources without rewriting their physical dates.
- [ ] Add a unique partial index on `grn_number where grn_number is not null`, a unique `(source_kind, source_id, do_number)` evidence guard for non-voided sessions, and constraints that allow `grn_number` only for posted/amended/voided history.
- [ ] Add `receiving_session_unit_outcomes(receipt_id, po_line_id, unit_code, outcome, evidence, created_at)` with unique `(receipt_id, unit_code)` and allowed outcomes `received`, `damaged`, `wrong_item`, `extra`.
- [ ] Add a locked one-row `grn_number_series` and these functions:

```sql
public.receiving_grn_actor(p_business_date date) returns jsonb
public.receiving_actor_may_post(p_user uuid, p_business_date date) returns boolean
public.allocate_grn_number(p_posting_date date) returns text
public.save_receiving_session(p_receipt_id uuid, p_expected_version integer, p_payload jsonb) returns jsonb
public.submit_receiving_session(p_receipt_id uuid, p_expected_version integer) returns jsonb
public.return_receiving_session(p_receipt_id uuid, p_expected_version integer, p_reason text) returns jsonb
public.post_receiving_session(p_receipt_id uuid, p_expected_version integer) returns jsonb
```

- [ ] `receiving_grn_actor(date)` resolves the following month's `ops_po_duty` row for the supplied Malaysia business date, then an applicable dated cover from `ops_po_duty_cover`. Return normal holder, cover, effective actor and month separately.
- [ ] `receiving_actor_may_post` allows the effective duty/cover or `is_operations_superuser`, without changing normal ownership.
- [ ] `allocate_grn_number` formats `GRN-YYYYMMDD-RRRR`, allocates under row lock and never uses `goods_received_at`.
- [ ] `post_receiving_session` locks the session, checks `lock_version`, source version, evidence, exact source balance and Unit IDs, and returns the already-posted result for an idempotent retry. It inserts the formal number and posting date only after every gate succeeds.
- [ ] Keep `office_receive_post` and `warehouse_receipt_check_in` only as compatibility wrappers into the same session save/submit/post functions. Current routes must stop calling the old direct stock path.
- [ ] Append events `draft_started`, `draft_saved`, `count_submitted`, `count_returned`, `count_resubmitted`, `grn_posted`, `grn_amended`, `grn_voided`, `evidence_added`. Every event stores source version, normal duty, cover, actual actor, authority and Malaysia event time.
- [ ] Add migration sanity blocks for ordinary-user refusal, duty, cover, Operations Superuser, duplicate DO, stale version, missing evidence, Unit mismatch, posting-date format and idempotent retry.
- [ ] Run `pnpm ci:migrations`; expected: every migration filename and immutability check passes. Do not apply the migration to production.
- [ ] Commit: `git add supabase/migrations && git commit -m "feat(receiving): persist one formal GRN authority"`.

## Task 3: Make one API own save, submit, return and post

**Files:**
- Modify: `apps/api/src/routes/operation/warehouse-receipts.ts`
- Modify: `apps/api/src/routes/operation/warehouse-receipts.test.ts`
- Modify: `apps/api/src/routes/warehouse/receiving.ts`
- Modify: `apps/api/src/routes/warehouse/receiving.test.ts`
- Modify: `apps/api/src/routes/operation/pos.ts`
- Modify: `apps/api/src/routes/operation/pos.test.ts`
- Modify: `apps/api/src/lib/route-helpers.ts` only if a new structured PostgreSQL detail mapping is required.

- [ ] Write failing route tests for `POST /api/operation/warehouse-receipts`, `PATCH /:id`, `POST /:id/submit`, `POST /:id/check-in`, and `POST /:id/send-back`. Test `expectedVersion` on every mutation.
- [ ] Make Warehouse `POST /api/warehouse/receipts` create/save and submit the same session contract, not a Warehouse-only payload. It may never call the posting RPC.
- [ ] Make Office `POST /api/operation/pos/:id/office-receive` a compatibility entrance that creates a Receiving Session then calls `post_receiving_session`; do not expose a second stock mutation.
- [ ] Return structured `409 stale_receiving_session`, `409 duplicate_supplier_do`, `422 evidence_missing`, `422 unit_id_mismatch`, `422 over_delivery_requires_exception`, and `403 grn_authority_required` responses with the exact problem/action copy.
- [ ] After successful posting, run existing reservation continuation once. A failed non-transactional continuation must create visible continuation work/evidence; it must not roll back or duplicate the already-committed GRN.
- [ ] Assert route spies show exactly one `post_receiving_session` call and zero direct `operation_receive_po_with_do` calls from application routes.
- [ ] Run `pnpm --filter @carres/api test -- src/routes/operation/warehouse-receipts.test.ts src/routes/warehouse/receiving.test.ts src/routes/operation/pos.test.ts`; expected: pass.
- [ ] Commit: `git add apps/api && git commit -m "feat(receiving): converge office and warehouse doors"`.

## Task 4: Expose one Receiving Register projection

**Files:**
- Create: `packages/shared/src/receiving-register.ts`
- Create: `packages/shared/src/receiving-register.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/routes/operation/warehouse-receipts.ts`
- Modify: `apps/api/src/routes/operation/warehouse-receipts.test.ts`
- Modify: `apps/web/src/lib/queries.ts`

- [ ] Define `ReceivingRegisterParent` for one open PO/CO delivery balance and `ReceivingRegisterChild` for each physical session/posted GRN. Children disclose beneath the parent; they are not separate competing top-level truths.
- [ ] Project these exact facts: `grnNumber`, `sourceNumber`, `poIssuedAt`, `supplier`, `deliverTo`, `poDeliveryDate`, `supplierDeliveryDate`, `goodsReceivedAt`, all six quantities including Extra, `supplierDoNo`, and `unitIds`.
- [ ] Consume the latest `po_supplier_promises` answer as `supplierDeliveryDate`; preserve the original source date separately. An unchanged promise returns `sameAsPo: true`.
- [ ] Add `GET /api/operation/warehouse-receipts/register?date=late|YYYY-MM-DD|later|none`. Default response returns all open balances, late first, then governed arrival date.
- [ ] Compute six date rows through Warehouse calendar Monday–Saturday, excluding Sunday and Selangor public holidays. Preserve recorded dates; never move them to a working day.
- [ ] Return zero rail counts explicitly. Do not return `Source`, purchase origin, Accepted, Rejected, status or Work columns.
- [ ] Add `useReceivingRegister(filter)` and stable query keys. Posting invalidates Receiving, PO, Stock, Claims and Work projections only after success.
- [ ] Run shared and route tests; expected: full/partial/late/no-date/changed-supplier-date projections pass.
- [ ] Commit: `git add packages/shared apps/api apps/web/src/lib/queries.ts && git commit -m "feat(receiving): project one dated receiving register"`.

## Task 5: Make global GRN search use stored identity

**Files:**
- Modify: `apps/api/src/routes/operation/jump.ts`
- Modify: `apps/api/src/routes/operation/jump.test.ts`
- Modify: `packages/shared/src/jump-to.ts`
- Modify: `packages/shared/src/jump-to.test.ts`
- Modify: `apps/web/src/pages/operation/components/ReceivingRecord.tsx`
- Modify: `apps/web/src/pages/operation/SalesOrderWorkspace.tsx`

- [ ] Write failing tests proving exact and partial `GRN-YYYYMMDD-RRRR` queries use `warehouse_receipts.grn_number`, return posted/amended/voided searchable documents according to permission, and never derive a number from receipt ID or physical date.
- [ ] Remove `GRN_RECENT_WINDOW`, date reconstruction and `receivingRecordNo` from the live jump path. Query the stored indexed number with a sanitised partial predicate.
- [ ] Deep-link to `/operation?tab=receiving&receipt={receiptId}`. A Work deep-link may also include `po={poId}` but must open the exact session.
- [ ] Render historical pre-migration fallback as `Legacy receipt` only until migration backfill assigns a stored legacy GRN; never present a derived value as the formal `GRN No.`.
- [ ] Run jump, ReceivingRecord and SalesOrderWorkspace tests; expected: no live use of derived GRN identity remains.
- [ ] Commit: `git add packages/shared apps/api apps/web && git commit -m "fix(receiving): find GRNs by stored document number"`.

## Task 6: Rebuild the page as the approved Receiving Register

**Files:**
- Modify: `apps/web/src/pages/operation/OperationReceiving.tsx`
- Modify: `apps/web/src/pages/operation/OperationReceiving.test.tsx`
- Create: `apps/web/src/pages/operation/receiving/ReceivingDateRail.tsx`
- Create: `apps/web/src/pages/operation/receiving/ReceivingDateRail.test.tsx`
- Create: `apps/web/src/pages/operation/receiving/ReceivingRegister.tsx`
- Create: `apps/web/src/pages/operation/receiving/ReceivingRegister.test.tsx`
- Reuse unchanged unless a proven shared bug is found: `apps/web/src/pages/operation/components/workspace-rail.tsx`
- Reuse unchanged unless a proven shared bug is found: `apps/web/src/components/register/DataGrid.tsx`

- [ ] First replace stale tests for `to receive`, `Goods Received`, status facets, `Source`, Arrival, Accepted/Rejected and the 400px workspace with approved Register tests.
- [ ] Render the compact page header `Receiving` and `See what should arrive and record what actually arrived.`; no dashboard, KPI strip or page duplicate title.
- [ ] Use the shared 240px `FilterRail` with one `RECEIVING DATE` group: `Late`, six actual Warehouse work dates, `Later`, `No delivery date`. Every fixed row displays its count including zero.
- [ ] Use `register/DataGrid` for the parent rows, stable identity columns and inline child disclosure. Configure the approved columns; hide low-priority columns progressively at narrow widths without changing the information model.
- [ ] Keep the full Register free of any enclosing four-sided border. Assert toolbar bottom divider, grid lines and footer top divider remain.
- [ ] `Supplier Delivery Date` displays only as a changed-date fact; unchanged reads `Same as PO`.
- [ ] A parent row's action is `Start Receiving`; an existing draft/submitted row opens that exact session instead of creating another.
- [ ] At narrow width, rail can hide behind `Show filters`; the table scrolls horizontally and identity remains visible.
- [ ] Run `pnpm --filter @carres/web test -- src/pages/operation/OperationReceiving.test.tsx src/pages/operation/receiving/ReceivingDateRail.test.tsx src/pages/operation/receiving/ReceivingRegister.test.tsx`; expected: pass.
- [ ] Commit: `git add apps/web && git commit -m "feat(receiving): build the dated receiving register"`.

## Task 7: Build the persistent Receiving Session object and GRN preview

**Files:**
- Modify: `apps/web/src/pages/operation/components/ReceivingWorkspace.tsx`
- Create: `apps/web/src/pages/operation/components/ReceivingWorkspace.test.tsx`
- Modify: `apps/web/src/pages/operation/components/ReceivingRecord.tsx`
- Create: `apps/web/src/pages/operation/receiving/ReceivingSessionDetail.tsx`
- Create: `apps/web/src/pages/operation/receiving/GrnPreview.tsx`
- Create: `apps/web/src/pages/operation/receiving/GrnPreview.test.tsx`
- Reuse: `apps/web/src/pages/operation/components/GoodsMiniTable.tsx`
- Modify: `apps/web/src/lib/queries.ts`

- [ ] Write failing journeys for full, partial, damaged, wrong, extra, missing DO, missing signed photo, missing/wrong Unit ID, Warehouse submission, Carres direct count, send-back/resubmit, idempotent retry and stale-save reload.
- [ ] Create the draft immediately on `Start Receiving`. Autosave with `lockVersion`; reload restores the same session. Closing the screen never discards server truth.
- [ ] Show source PO/CO, supplier, Deliver To, PO Issued, PO Delivery Date, Supplier Delivery Date and Goods Received At as distinct facts.
- [ ] Use one GoodsMiniTable row per ordered line with Order, Received, Damaged, Wrong Item, Extra and Pending Delivery. Unit-tracked lines require exact governed IDs.
- [ ] Carres station action is `Save Receiving`; Warehouse/showroom action is `Send count`; GRN authority actions are `Check in` and `Return count to {warehouse}`.
- [ ] Keep disabled actions understandable: show the exact first missing fact and exact action beneath it. Do not use `Invalid`, `Failed`, `Pending` or generic `Follow up`.
- [ ] A posted record is read-only. At 1130px and wider render 50% operational facts and 50% formal `GOODS RECEIPT NOTE` preview; below 1130px stack preview after facts.
- [ ] Preview prints stored GRN No., source number/version snapshot, supplier/destination snapshot, Supplier DO, physical/submit/post dates, quantities, Unit IDs and evidence references. Reprint uses the same stored number.
- [ ] History shows actual actor, normal GRN Duty and dated cover as separate structured facts.
- [ ] Run workspace and preview tests; expected: all approved operator journeys pass.
- [ ] Commit: `git add apps/web && git commit -m "feat(receiving): guide count review and formal GRN"`.

## Task 8: Keep Warehouse/showroom and ownership seams honest

**Files:**
- Modify: `apps/web/src/pages/warehouse/WarehouseIncoming.tsx`
- Modify: `apps/web/src/pages/warehouse/WarehouseMyReceipts.tsx`
- Modify corresponding tests under `apps/web/src/pages/warehouse/`
- Modify: `packages/shared/src/warehouse-receipt.ts`
- Modify: `packages/shared/src/warehouse-receipt.test.ts`
- Modify: `apps/api/src/routes/warehouse/receiving.test.ts`
- Modify: `apps/api/src/routes/operation/warehouse-receipts.test.ts`

- [ ] Prove a Warehouse account sees only POs delivered to its governed warehouse and can count/submit but cannot post, change source facts, or see prices.
- [ ] Prove an explicitly governed showroom destination uses the same session contract, roster identity and evidence rules; default remains the configured Carres warehouse.
- [ ] Add a `ReceivingSourceAdapter` seam whose PO implementation is live and whose CO contract carries `ownership: "supplier"`. A CO test fixture may exercise the pure adapter, but no fake CO data may be seeded into production or the browser walk.
- [ ] Assert consignment posting preserves supplier ownership, exact Unit IDs and physical showroom location and creates no payable signal. If no governed CO source exists at runtime, return `409 source_not_available`; never fall back to a PO or manual receipt.
- [ ] Assert damaged/wrong/extra physical custody may create protected `Not available` Stock custody, but never available stock or received quantity.
- [ ] Run Warehouse web/API/shared tests; expected: scope, ownership and capability boundaries pass.
- [ ] Commit: `git add packages/shared apps/api apps/web && git commit -m "test(receiving): preserve destination and ownership seams"`.

## Task 9: Project Receiving and supplier actions into central Work

**Files:**
- Create: `packages/shared/src/module-work-feed.ts`
- Create: `packages/shared/src/module-work-feed.test.ts`
- Create: `packages/shared/src/receiving-work.ts`
- Create: `packages/shared/src/receiving-work.test.ts`
- Modify: `packages/shared/src/work-engine.ts`
- Modify: `packages/shared/src/work-engine.test.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/api/src/routes/operation/work.ts`
- Create: `apps/api/src/routes/operation/work.test.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/web/src/pages/operation/use-open-work.ts`
- Modify: `apps/web/src/pages/operation/OperationWork.tsx`
- Modify: `apps/web/src/pages/operation/OperationWork.test.tsx`
- Modify: `apps/web/src/pages/operation/components/rail/TeamPanel.tsx`
- Modify: `apps/web/src/pages/operation/components/rail/TeamPanel.test.tsx`
- Modify: `apps/web/src/lib/queries.ts`

- [ ] Define one read-only `ModuleWorkItem` with stable ID, module, source ID, owner rule/context, fact line, action line, due ISO date, Office/Warehouse calendar, completion fact, evidence flag and exact destination.
- [ ] Project supplier-date missing, pre-arrival confirmation, late arrival, balance-date missing, submitted count, arrival check-in and missing receiving evidence from authoritative PO/session facts.
- [ ] Office supplier work uses Monday–Friday. Warehouse Receiving work uses Monday–Saturday. Saturday/Monday confirmation is due Friday or the preceding valid Office day when Friday is a Selangor holiday. Late keeps original due date.
- [ ] Supplier work remains owned by PO Duty/cover and completion requires recorded answer/channel/evidence/reporter/recorder/times. Opening WhatsApp/email or a call link completes nothing.
- [ ] Receiving posting work is owned by GRN Duty/cover. Operations Superuser capability does not reassign every item to the superuser.
- [ ] Add `GET /api/operation/work?scope=mine|team&module=receiving|purchasing`; compose module projections without writing outcomes.
- [ ] Merge the feed into `useOpenWorkSet` by stable ID. My Work remains default; Team Work uses the same item set and real roster/cover metadata.
- [ ] Deep-link PO supplier work to the exact Purchase Order and Receiving work to the exact PO/session. Receiving's local rail remains only `RECEIVING DATE`.
- [ ] Run shared/API/Work/TeamPanel tests; expected: no manual Done mutation and no duplicate Work store exists.
- [ ] Commit: `git add packages/shared apps/api apps/web && git commit -m "feat(work): show purchasing and receiving daily actions"`.

## Task 10: Verify Claim, later-damage and Purchase Return boundaries

**Files:**
- Modify only if tests expose a boundary defect: `packages/shared/src/supplier-claim.ts`
- Modify: `packages/shared/src/supplier-claim.test.ts`
- Modify: `apps/api/src/routes/operation/supplier-claims.test.ts`
- Modify: `apps/web/src/pages/operation/OperationReceiving.test.tsx`
- Modify: `apps/web/src/pages/portal/purchasing-sidebar.test.ts`
- Modify relevant Stock tests under `packages/shared/src/` and `apps/api/src/routes/operation/`.

- [ ] Add regression tests proving damaged/wrong/extra at arrival is evidence on Receiving and does not itself reduce pending or make stock available.
- [ ] Prove later-discovered damage leaves the posted GRN sealed and enters through Service Case; only authorised supplier-responsible outcome may create Supplier Claim.
- [ ] Current main has no Purchase Return domain/API implementation; keep its governed sidebar destination marked unavailable and assert Receiving exposes no direct Return creation control or mutation.
- [ ] Record the future integration contract in the active Purchasing/Receiving authority: only an approved Claim/outcome may create Purchase Return; document issue moves no custody; exact Unit handover evidence owns the later Stock consequence; partial collection stays open.
- [ ] Do not add Claim decisions, Return creation or Stock correction controls to Receiving.
- [ ] Run Claim, Receiving, sidebar and Stock regression suites; expected: module ownership remains distinct and no unavailable Return writer is invented.
- [ ] Commit only if code or tests changed: `git add packages/shared apps/api apps/web docs && git commit -m "test(receiving): protect claim return and stock ownership"`.

## Task 11: Copy, accessibility and layout verification

**Files:**
- Modify: `apps/web/src/pages/operation/purchasing-words.test.ts`
- Modify: `apps/web/src/pages/operation/OperationReceiving.test.tsx`
- Modify: `docs/COPY-STANDARD.md` only when an approved phrase is absent.

- [ ] Assert navigation `Receiving`, object `Receiving Session`, transaction `Goods Receipt`, document `GRN`, `GRN No.`, actions and exact two-line copy.
- [ ] Assert retired visible words are absent: `Goods Receipts` navigation, `Goods Received` register, `Source`, `Arrival Date`, `Expected`, `Accepted`, `Rejected`, bare `Pending`, generic `Follow up`.
- [ ] Verify focus order, keyboard row open, labelled inputs, error association, visible focus and minimum touch targets at narrow width.
- [ ] Verify no sample staff, fake supplier/order rows, KPI cards, duplicate local Work panel, duplicate PO/receipt writer or new UI system.
- [ ] Run web word/layout/accessibility tests; expected: pass.
- [ ] Commit: `git add apps/web docs && git commit -m "test(receiving): enforce approved words and layout"`.

## Task 12: Integration, PR and governed release proof

- [ ] Fetch and rebase onto latest `origin/main`. Resolve conflicts in favour of current authority, especially UI MASTER's no-outer-frame Register rule. Never rewrite applied migrations.
- [ ] Run targeted tests from Tasks 1–11.
- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm ci:migrations`, and `pnpm build`; expected: all pass.
- [ ] Run repository governance/design/copy/secret-bundle checks named by `CLAUDE.md` and current ERP PLAN CHAT START PROTOCOL; expected: pass with no new governed violation.
- [ ] Search application routes for `operation_receive_po_with_do`, `office_receive_post`, `warehouse_receipt_check_in`, `post_receiving_session`, and `receivingRecordNo`. Verify current post entrances converge on one RPC and stored GRN identity owns display/search.
- [ ] Run desktop and narrow-width browser walks locally with permitted real account shapes. Capture full/partial/missing-evidence/send-back/post/search journeys without production fake data.
- [ ] Commit verification corrections, push `codex/receiving-grn`, update the existing PR and wait for all CI checks. Report code integrated only after merge, never when merely pushed.
- [ ] Stop before production migration. Present exact migration filename, CI evidence, rollback/recovery approach, affected objects and post-apply verification to the Owner under the repository's governed migration approval gate.
- [ ] Only after explicit approval, apply through the repository's governed deployment path. Never run an ad-hoc production SQL command.
- [ ] Verify the exact production SHA, migration presence, real navigation, date rail, session deep-link, formal GRN lookup, PO balance, Stock consequence, Work owner/cover and immutable history.
- [ ] Perform real desktop and narrow-width production walks with permitted accounts and eligible real records. Do not create fake supplier/order data.
- [ ] Report three separate final states with evidence: authority/design aligned; code implemented/integrated; production deployed/verified.

## Completion evidence checklist

- [ ] Manual Purchase and SO Batch Purchase both reach the same PO and Receiving writer, proved without editing either source page.
- [ ] Full and partial receipt preserve correct PO balance.
- [ ] Damaged, wrong and extra quantities remain distinct and unavailable.
- [ ] Missing DO/evidence and missing/wrong Unit IDs give exact two-line recovery copy.
- [ ] Warehouse and showroom count/submit cannot post.
- [ ] Stored `GRN-YYYYMMDD-RRRR` is allocated on Malaysia posting date, searchable and idempotent.
- [ ] Supplier and Receiving Work uses real roster, duty/cover and correct calendars.
- [ ] GRN preview/reprint preserves number, source snapshot, evidence and audit identity.
- [ ] Claim, later-damage, Return, Stock, Finance and future CO boundaries remain owned by their modules.
- [ ] CI, migration law, build, merge, governed deployment and real browser verification are each independently evidenced.
