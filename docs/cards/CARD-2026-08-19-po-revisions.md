# CARD — PO Revisions · a sent PO is not overwritten, it is REVISED

**STATUS: EXECUTED** *(2026-08-19 — built, tested, PR opened; migration 0364 DRAFTED, not
applied: the parent session applies it after review, then deploys — the Worker's list select
names `version` / `revised_at`, so 0364 must land BEFORE the API deploy)*
**Tab: Purchase Orders** — `po-revisions` · one Revise door on the PO panel, the version fact, the floor.

---

## THE RULING (Jess 2026-08-18 — APPROVED / LOCKED in `docs/purchasing/MASTER.md` §4 FROZEN RULES; transcribed, not reinterpreted)

- **A sent PO is not overwritten — it is REVISED.** Cancel-and-reissue puts TWO numbers for
  ONE job in the factory's hands, and a factory reads two numbers as two jobs. A change KEEPS
  the number and mints `PO-2041 · Version 2`.
- **The prior version is snapshotted** (`po_revisions`, the 0312 store — measured live before
  any SQL was written), **the reason and the author are stored.**
- **The PO drops back to `Issued` until the new version's share is confirmed** through the
  existing two-step share machinery: `{Channel} opened · Snapshot N` is the click, then the
  operator answers WHICH version / WHICH supplier / WHICH channel — **only the answer is the
  share.**
- **THE FLOOR: no line may be revised BELOW its `received_qty`.** The RPC refuses with a
  `received_floor` error; the excess goes back through a Purchase Return first. (2990s proves
  both halves in production: `PurchaseOrderDetail.tsx:621` snapshots the prior version into
  `po_revisions`; approve-po 409s `received_floor` — `so-revision.ts`'s `ReceivedFloorError`.)
- **Adding items is still a NEW PO; stopping is still the whole PO (Cancel).** A revision edits
  EXISTING lines only: qty (floored at `received_qty`) and line destination. The Deliver To
  after-send rule (owner-locked 2026-08-14) routes through this same revision mint — never a
  silent overwrite.
- **Reason is required IN SQL. Author from auth. A `po_history` row is appended.** PO-line
  quantities remain RPC-only (0316) — no client PATCH.

## MEASURED BEFORE BUILDING (live production, supabase MCP, 2026-08-19)

- `po_revisions` exists since 0312 — `id · po_id · rev_no · snapshot jsonb · created_by ·
  created_at`, `unique (po_id, rev_no)`, SELECT-policy only, write grants revoked. 3 rows live.
- `po_sends` — `id · po_id · revision_id · channel · note · sent_by · sent_at`. 5 rows live.
- `purchase_orders` carries NO version column and NO `revised_at`; `po_status` is
  `{open, received, cancelled}` — `Issued` is a work-state word, not a DB status.
- `purchase_order_lines.qty` / `received_qty` are integers; `destination_id` is the 0311
  per-line override over the PO's own (`coalesce(line, po)` at every read).
- Migration tails: applied tracker **0363** · repo main **0363** · every remote branch **0363**
  → this card's migration is **0364**.
- The two-step share's STEP TWO (`Record what you sent`, COPY-STANDARD 2026-08-18) is ruled but
  **not yet built** — production holds `purchasing_record_send` (the click) only. This card does
  not build step two; it mints the version fact and the "Version {n} has not reached
  {supplier}" derivation that step two will read. Pre-existing gap, not widened here.

## SLICES

1. **Migration 0364 (DRAFT — the parent session applies it after review).**
   `purchase_orders.version int not null default 1` + `revised_at timestamptz` ·
   `po_revisions.reason text` · RPC `purchasing_revise_po(p_po_id, p_reason, p_lines jsonb)` —
   SECURITY DEFINER behind `purchasing_supplier_call_gate()`: reason required in SQL, existing
   lines only, qty ≥ 1 and ≥ `received_qty` (else `received_floor`), destination from the
   governed registry, must actually change something, snapshots the PRIOR version (0312's exact
   snapshot shape, so the share machinery's changed-since-last-send comparison keeps working),
   bumps `version`, stamps `revised_at`, appends `po_history`, writes `audit_log`.
2. **API.** `POST /operation/pos/:id/revise` → the RPC; `received_floor` surfaces as 409 with a
   structured body. `GET /operation/pos` ships `version` and `revised_at`.
3. **Shared.** The revise contract words + `poVersionLabelOf` + the unshared-version notice
   (`{po} Version {n} has not reached {supplier}` — COPY-STANDARD's governed sentence), with
   tests. No page-local word table (Law 7).
4. **Web.** The panel title reads `PO-2041 · Version 2`; the panel gains a `Revise` door — kit
   components only: editable qty cells with the floor stated inline, line destination select
   from the governed registry, ONE required reason field, Save mints the version. Zero
   popups/toasts; the disabled Save NAMES its gap (`Save — say why` · `Save — nothing changed`
   · `Save — below received`). No new register column: the version fact lives on the panel
   title and the revise surface.
5. **Docs.** COPY-STANDARD PURCHASING/PO block gains the few new words; purchasing MASTER §4
   gains the shipped record under the revision rule; this card flips to EXECUTED.

## OUT OF SCOPE (the sibling card's lane — untouched)

`OperationToOrder.tsx` · `packages/shared/src/to-order.ts` ·
`apps/api/src/routes/operation/to-order.ts` · Receiving / Claims / Report / Settings files ·
purchasing MASTER §3 · the register's measured column widths (no new column).

## BUILD RECORD (2026-08-19)

- **Migration 0364** — `supabase/migrations/0364_a_sent_po_keeps_its_number_and_mints_a_version.sql`
  (DRAFT, not applied). `purchase_orders.version` + `revised_at` · `po_revisions.reason` ·
  `purchasing_revise_po` (SECURITY DEFINER behind `purchasing_supplier_call_gate()`, reason
  required in SQL, existing-lines-only, `received_floor` before any write, prior version
  snapshotted in 0312's exact shape with reason + author, `po_history` old → new, `audit_log`)
  · a BEFORE UPDATE trigger on `purchase_order_lines(qty, destination_id)` that refuses a
  silent change once any `po_sends` row exists (`A shared PO changes through Revise.`) unless
  the revise door's transaction-local flag is set · a sanity block re-asserting 0312's two
  locks. Number chosen by MAX of three measured tails: applied tracker 0363 · repo main 0363 ·
  every remote branch 0363.
- **API** — `apps/api/src/routes/operation/pos.ts`: `POST /:id/revise`; `received_floor` → 409
  with a structured body (2990s' status); `reason_required` / `nothing_changed` /
  `sent_po_needs_revision` → 422 by name; the list select ships `version` + `revised_at`.
- **Shared** — `revisePoInput` (`schemas/operation.ts`) · `poVersionLabelOf` ·
  `poReviseSaveGapOf` · `poUnsharedVersionNoticeOf` (`po-workspace.ts`) with tests.
- **Web** — `OperationPurchaseOrders.tsx`: panel title `PO-2041 · Version 2` (Version 1 prints
  nothing) · `Revise` door beside `Print PDF` on an open PO · the form takes the stage (the
  read-only items block and the Communication desk step aside, so rule 3's one-editing-surface
  holds) · qty inputs with the floor stated inline · destination select from the registry ·
  one required `Why` · disabled Save names its gap, floor first · only changed lines ride the
  wire · zero popups/toasts, server refusals print inline. 8 new page tests; `useRevisePo` in
  `queries.ts`.
- **Docs** — COPY-STANDARD gains the PO REVISIONS word block; purchasing MASTER §4 carries the
  shipped record under the revision rule, the `/:id/revise` route, the new control ids and the
  re-measured table counts.
- **Gates** — shared 2445 ✓ · web 3059 ✓ (263 files) · api 2278 ✓ · `tsc -p
  apps/web/tsconfig.app.json` ✓ · `pnpm -r lint` exit 0 (stage-1 warn-only).
- **REPORTED, not chosen silently** — ① the two-step share's STEP TWO (`Record what you sent`)
  is ruled (COPY-STANDARD 2026-08-18) but was never built; this card mints the version fact and
  the derived unshared sentence that step will answer about, and does not build the answer
  form. ② the shared-PO guard also refuses a SPLIT after a send (revise cannot split a line
  yet) — the refusal names the door, and teaching revise to split is its own card. ③ the
  PO-LEVEL destination writer (`/:id/reassign-warehouse`) is outside this card's guard; only
  the line-level facts the revise door edits are closed.
