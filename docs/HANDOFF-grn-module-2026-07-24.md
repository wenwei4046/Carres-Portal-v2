# HANDOFF · GRN module (Path A) · 2026-07-24

**Branch**: `feat/purchase-downstream-p1` (off `bc90f73c`, main tip at start).
**Owner sign-off**: Jess picked **A** (2026-07-24) — extend existing
`ReceivePOModal` + wrap the existing receive RPC. Q7 (docNumber seed) = **(a)
GRN's own uuid**. Q1–Q6 all locked in chat.

## What's shipped this session (committed on branch, NOT deployed, NOT applied)

1. **Migration `0244_grns_and_grn_lines.sql`** — 3 things:
   - `grns` table (header, GRN-DDMMYY-NNNN numbered, hashed tail from grn uuid).
   - `grn_lines` table (Recv / Acc / Rej / Reason split, with CHECK constraints
     `qty_received = qty_accepted + qty_rejected` + `qty_rejected = 0 OR reason
     not null`).
   - New wrapper RPC `operation_receive_po_with_grn(p_po_id, p_do_file_path,
     p_do_number, p_lines, p_grn_lines, p_notes)` that PERFORMs the untouched
     4-arg `operation_receive_po_with_do` then inserts the GRN header + lines
     in the same transaction. **Existing RPC is byte-identical — zero risk to
     the current receive flow.**
   - RLS: internal-read only; writes via SECURITY DEFINER RPC only (deny-by-
     default under RLS, mirrors purchase_orders pattern).
   - Sanity DO block asserts wrapper exists on the 6-arg signature + delegates
     to the inner RPC + RLS is enabled.

2. **`packages/shared/src/schemas/grns.ts`** — full zod contract:
   - `grnStatusSchema`, `grnLineSchema`, `grnSchema`, `grnListResponseSchema`.
   - `receivePoWithGrnLineSchema` (with cross-field refines: `deltaReceived =
     qtyAccepted + qtyRejected`; `rejectionReason` required when
     `qtyRejected > 0`).
   - `receivePoWithGrnInput` + `receivePoWithGrnResult`.
   - `grnListQuerySchema` (server-paginated: status / supplier / warehouse /
     receivedBy / poId / search / from / to / page / pageSize; default 15/page).

## What's NOT done yet (next session · in order)

### P1 — Shared plumbing (~4 file edits, ~30 min)

- **`packages/shared/src/db-types.ts`** — append `GrnRow` + `GrnLineRow` snake-
  case row types (see mig 0244 for shape). Insertion point: end of file
  (after `PoPickupEventsRow` at line 1032).
- **`packages/shared/src/domain.ts`** — append `Grn` + `GrnLine` camelCase
  types (see `schemas/grns.ts` — the zod `Grn` type IS the shape, just import
  it and re-export or restate). Insertion point: end (after
  `ThreadReadinessRow`).
- **`packages/shared/src/adapters.ts`** — append `grnFromRow(r)` +
  `grnLineFromRow(r)` snake→camel adapters. Insertion point: end (after
  `inquiryFromRow`).
- **`packages/shared/src/index.ts`** — add `export * from "./schemas/grns";`
  at the end.

### P2 — API (~2 files, ~1 h)

- **New `apps/api/src/routes/operation/grns.ts`**:
  - `GET /api/operation/grns` — list with filters + pagination.
    Server WHERE clauses drive the filter (rule 12: 500+/mo scale). Enrich
    with `supplier(name)` + `warehouse(name)` + `count(grn_lines)` via
    PostgREST embed. Response = `{ grns, total }` per `grnListResponseSchema`.
  - `GET /api/operation/grns/:grnNumber` — detail w/ full `grn_lines` +
    supplier + warehouse.
- **Extend `apps/api/src/routes/operation/pos.ts` `POST /:id/receive`**:
  - Change body schema to `receivePoWithGrnInput` (adds `notes`, per-line
    `deltaReceived / qtyAccepted / qtyRejected / rejectionReason`).
  - Reshape payload: build `p_lines` (as today, `{id, received_qty: NEW
    TOTAL}`) AND `p_grn_lines` (`{po_line_id, qty_received: deltaReceived,
    qty_accepted, qty_rejected, rejection_reason}`).
  - Call **`operation_receive_po_with_grn`** (new wrapper) instead of the old
    RPC. Auto-reserve step downstream stays as-is.
- **Test coverage**: extend `apps/api/src/routes/operation/pos.test.ts` w/ a
  wrapper-RPC assertion + a new `grns.test.ts` for list + detail.

### P3 — Web (~4 files, ~2 h)

- **`apps/web/src/pages/operation/grn/GrnList.tsx`** — using `ListPageShell`
  (see `apps/web/src/components/ListPageShell.tsx`). Cols per mock:
  `[☐] · GRN No · Date · PO No · Supplier · Items · Received by · Status`.
  Filter chips: `All / Draft / Confirmed` + supplier / warehouse / received-by
  dropdowns + date range + search. Bulk actions in ⋮ menu (row-selected).
- **`apps/web/src/pages/operation/grn/GrnDetail.tsx`** — header block
  (GRN No / status / date / receiver / PO ref / supplier / warehouse / DO ref
  / batch = po_no / notes) + line items table (Ordered / Prev / Recv / Acc /
  Rej / Reason / Balance) + activity log + **[Print PDF]** button (wires to
  `grn-pdf.ts` — P4).
- **Extend `apps/web/src/pages/operation/components/ReceivePOModal.tsx`**:
  - Replace single `Receive now` input with `Recv / Acc / Rej` triple (Acc
    defaults to Recv, Rej defaults to 0; typing Rej auto-decrements Acc so
    Recv = Acc + Rej invariant holds live).
  - When `Rej > 0` on any line, mount a `Rejection reason` textarea below the
    lines table (required). Simple approach; per-line reason can wait for
    v1.1.
  - Add optional `Notes` textarea (top-level, → `p_notes`).
  - Call new `useReceivePoWithGrnMutation()` (add to `apps/web/src/lib/
    queries.ts`) that POSTs to the extended endpoint.
- **`apps/web/src/pages/portal/PortalSidebar.tsx`** — add `Goods Received`
  link under the Purchase / Operation section (mirror how `Purchase Order`
  link is registered). Route `/operation/purchase/grn` (list) + `/operation/
  purchase/grn/:grnNumber` (detail).

### P4 — PDF (~3 files + 1 package.json, ~2 h)

- **Add `jspdf` + `jspdf-autotable` deps** to `apps/web/package.json` (Carres
  has ZERO jspdf today — grepped `apps/web/src apps/api/src packages/shared/src`,
  no matches). `pnpm add -F @carres/web jspdf jspdf-autotable`.
- **`apps/web/src/lib/pdf-common.ts`** — build from scratch (adapted from
  `2990s/apps/backend/src/lib/pdf-common.ts` — copy the interface, not the
  literal code; Carres UI-KIT letterhead). Exports:
  - `COMPANY` constant (Carres Sdn Bhd letterhead).
  - `drawHeader(doc, {docTitle, rightMeta})`.
  - `drawInfoColumns(doc, y, leftBlock, rightBlock)`.
  - `drawSignatureBoxes(doc, y, leftLabel, rightLabel)`.
  - `safeName(s)`, `fmtDocDate(iso)`, (deliberately **no** `fmtRm` — Purchase
    docs are RM-hidden per 2026-07-24 lock).
- **`apps/web/src/lib/grn-pdf.ts`** — port from 2990s `grn-pdf.ts`:
  - Copy the layout / column widths / signature block / footer.
  - DROP the `Supplier Code` column (Carres uses one-code-only — see
    project-purchase-page-planning memory 7/21 lock).
  - DROP the `Unit Price` column (no-RM lock).
  - Keep columns: `# · Our Code · Description · Recv · Acc · Rej · Reason`.
  - Damaged lines stay in-row on the Reason column (2990s pattern).
  - Signature: `Warehouse Received By` + `Supplier Driver Signature`.
  - Footer: `<grn_number> · Carres Portal · Page N of M`.
- Wire `[Print PDF]` button on GrnDetail to invoke.

### P5 — Deploy (~30 min)

- Commit + push branch.
- **Merge branch → origin/main** (never deploy from feature branch per Loo
  rule 2026-07-19).
- **Apply mig 0244 via Supabase MCP** (`mcp__supabase__apply_migration`).
  Verify with `mcp__supabase__list_migrations` (tail should show 0244).
  Additive + dormant — safe to apply anytime (existing receive flow byte-
  identical until the API extension is deployed).
- Build web (`pnpm --filter @carres/web build`).
- Deploy web to **BOTH Pages projects** (`carres-portal` + `carres-pos`,
  `--branch=main`).
- Deploy Worker (`wrangler deploy` from `apps/api`).
- Verify: curl each of the 4 domains (carres-portal.pages.dev + carres-pos.
  pages.dev + erp.carresofficial.com + pos.carresofficial.com); grep the
  deployed bundle for a GRN marker (e.g. `Goods Received`).
- Grep dist for `SERVICE_ROLE` — must be 0.

### P6 — Memory + close-out

- Update `project-2990s-copy-and-gaps-2026-07-24` memory (mark P1 #2 GRN
  module as SHIPPED with mig 0244 + commit hash).
- Add `project-grn-module-2026-07-24` memory (short entry with what shipped,
  ReceivePOModal extension, dormant photo bucket carry-forward).
- Update CLAUDE.md §17 tail migration reference to 0244.

## Carry-forwards (design decisions consciously deferred)

- **Per-line dedicated damage photos** — v1 relies on the existing
  `delivery-orders` bucket DO file for damage evidence (with a hint in the
  modal to include damage shots in the DO photo). v1.1 = add `grn_photos`
  table + per-line photo picker.
- **own_logistics per-thread receive path** — the ReceivePOModal's second
  section (`Receive N threads`) still calls the old `operation_receive_threads`
  RPC (mig 0107). No GRN header materialized for own_logistics receives in v1.
  v1.1 = build a similar wrapper for `operation_receive_threads`.
- **Draft status** — mig supports draft/confirmed but v1 UI always creates
  confirmed. Draft flow (save mid-receive) can come later if operators ask.
- **GRN Amendment** — RPC has no `revision` bump today; amending an existing
  GRN post-confirm would need a `revise_grn` RPC + `-B / -C` doc-number
  suffix. Not requested; defer.

## Files touched this session

- `supabase/migrations/0244_grns_and_grn_lines.sql` (NEW · 216 lines)
- `packages/shared/src/schemas/grns.ts` (NEW · 130 lines)
- `docs/HANDOFF-grn-module-2026-07-24.md` (THIS FILE)

## Owner locks re-stated (do not renegotiate)

- Q1 (number) = `GRN-DDMMYY-NNNN`, hashed tail (per `docNumber()`).
- Q2 (post-confirm edit) = only Notes + photos; qty/SKU locked.
- Q3 (damaged photo) = mandatory (v1 covered by DO file; v1.1 = dedicated).
- Q4 (PDF damaged) = 2990s pattern → Recv/Acc/Rej + Reason columns.
- Q5 (columns) = drop Supplier Code (no dual-code) + drop Unit Price (no RM).
- Q6 (top tabs) = All / Draft / Confirmed only; more quick-views later.
- Q7 (docNumber seed) = **(a) GRN's own uuid**.
