# Purchase Orders Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the permanent Purchasing → Purchase Orders Register and governed PO object so Operations can find every PO, read its official document state, issue/revise the exact PDF, record supplier answers with evidence, and follow Receiving/GRN connections.

**Architecture:** Keep one server-composed PO read model and one shared pure derivation for Register state/work. Add only the missing immutable date/evidence facts and extend the existing governed PO RPCs; the browser renders the approved Sales Orders Register grammar and uses the existing Receiving/claim/unit readers without writing their records.

**Tech Stack:** TypeScript, React 19, TanStack Query, Hono, Supabase/PostgreSQL, Vitest, Testing Library, React PDF, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-30-purchase-orders-register-design.md`

## Global Constraints

- Use `PO Issued`, never `PO Date`; `Issued` is a status only after current-version outbound evidence.
- Default columns are exactly `PO No` · `PO Issued` · `Supplier` · `Items` · `Related To` · `Deliver To` · `PO Delivery Date` · `Supplier Delivery Date` · `Order Qty` · `Received Qty` · `Pending Delivery Qty` · `Status` · `Work`.
- The navigation/workspace word is `Receiving`; `Check in`, `Goods Receipt`, `GRN`, and `Supplier DO` keep their separate meanings.
- Work sentences contain no staff or supplier names; owner, cover, recipient/result, due date and actual actor are structured metadata.
- Opening WhatsApp/email or downloading a PDF completes nothing.
- Supplier answers never overwrite the official PO Delivery Date.
- Damaged, wrong and extra goods never reduce Pending Delivery Qty and never create available Stock.
- `operation@carres.com` and Jess are Operations Superusers; normal PO Duty and dated cover remain owner metadata, and the actual actor is stored separately.
- Do not add another PO, Work, Receiving, Goods Receipt, GRN, claim, return, Stock or Finance writer.
- Do not apply any production migration.

---

### Task 1: Authoritative PO Register Derivation

**Files:**
- Modify: `packages/shared/src/purchase-order-register.ts`
- Modify: `packages/shared/src/purchase-order-register.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: persisted PO header, line problem quantities, supplier-answer rows and exact-version outbound rows.
- Produces: `purchaseOrderIdentity()`, `purchaseOrderRegisterFacts()`, `purchaseOrderWork()`, `PurchaseOrderRegisterFacts`, and `PurchaseOrderWorkCopy` for the API/browser.

- [ ] **Step 1: Write failing dictionary, quantity and work tests**

```ts
expect(purchaseOrderIdentity("PO-2032", 1)).toBe("PO-2032");
expect(purchaseOrderIdentity("PO-2032", 2)).toBe("PO-2032 · Version 2");
expect(facts.quantities).toEqual({ orderQty: 5, receivedQty: 3, damagedQty: 1, wrongItemQty: 1, pendingDeliveryQty: 2 });
expect(facts.documentState).toBe("The PO PDF has not been sent");
expect(work).toEqual({ problem: "The supplier delivery date is missing", action: "Ask for the delivery date", kind: "supplier_date", dueOn: "2026-08-31" });
```

- [ ] **Step 2: Run the shared test and confirm it fails**

Run: `pnpm --filter @carres/shared test -- purchase-order-register.test.ts`

Expected: FAIL on the old identity, quantity keys and supplier-name action copy.

- [ ] **Step 3: Implement the one pure derivation**

```ts
export interface PurchaseOrderWorkCopy {
  kind: "issue" | "supplier_date" | "supplier_date_passed";
  problem: string;
  action: string;
  dueOn: string | null;
}

export function purchaseOrderIdentity(id: string, version: number): string {
  return version > 1 ? `${id} · Version ${version}` : id;
}
```

Use good `receivedQty` only for `pendingDeliveryQty`; preserve damaged/wrong as independent facts. Derive the five status words and the unsent preliminary fact from the current-version confirmation.

- [ ] **Step 4: Re-run shared tests**

Run: `pnpm --filter @carres/shared test -- purchase-order-register.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the derivation**

```bash
git add packages/shared/src/purchase-order-register.ts packages/shared/src/purchase-order-register.test.ts packages/shared/src/index.ts
git commit -m "feat(purchasing): align purchase order register facts"
```

### Task 2: Governed Date, Evidence and Superuser Authority

**Files:**
- Create: `supabase/migrations/0401_the_supplier_answer_never_rewrites_the_po.sql`
- Modify: `packages/shared/src/purchasing-po-authority.test.ts`
- Create: `packages/shared/src/purchase-order-evidence.test.ts`

**Interfaces:**
- Consumes: `purchase_orders`, `po_revisions`, `po_supplier_promises`, `po_sends`, `ops_po_duty`, `ops_po_duty_cover`, `app_users`, `storage.objects`.
- Produces: `purchase_orders.po_delivery_date`, append-only supplier evidence facts, exact actor/owner metadata, `purchasing_record_supplier_answer(...)`, and the extended single `purchasing_revise_po(...)` authority.

- [ ] **Step 1: Write failing migration-law tests**

```ts
expect(sql).toContain("add column if not exists po_delivery_date date");
expect(sql).toContain("supplier_answered_at timestamptz not null");
expect(sql).toContain("reported_by uuid");
expect(sql).toContain("recorded_by uuid");
expect(sql).toContain("evidence jsonb not null");
expect(sql).toMatch(/operation@carres\.com/i);
expect(sql).toMatch(/jess@carres\.com/i);
expect(sql).not.toMatch(/update public\.purchase_orders\s+set eta_date/i);
```

- [ ] **Step 2: Run the focused migration tests and confirm they fail**

Run: `pnpm --filter @carres/shared test -- purchasing-po-authority.test.ts purchase-order-evidence.test.ts`

Expected: FAIL because migration 0401 does not exist.

- [ ] **Step 3: Add the append-only authority migration**

```sql
alter table public.purchase_orders
  add column if not exists po_delivery_date date;

alter table public.po_supplier_promises
  add column if not exists channel text,
  add column if not exists evidence jsonb,
  add column if not exists supplier_answered_at timestamptz,
  add column if not exists reported_by uuid references public.app_users(id),
  add column if not exists recorded_at timestamptz not null default now();
```

The migration must: stamp `po_delivery_date` only for new PO creation; leave legacy rows null; keep supplier answers append-only; require screenshot/file evidence or a structured phone/in-person note; replace the existing supplier-answer RPC without updating `eta_date`; extend the one revision RPC to accept `p_po_delivery_date`, snapshot the prior official date, apply the new date in the same transaction, and mint one version; replace `purchasing_actor_may_issue` so Operations Superusers pass while duty/cover remains metadata; add private storage rules for PO evidence; include signature, policy, grant and no-manufactured-backfill sanity checks.

- [ ] **Step 4: Re-run migration-law tests**

Run: `pnpm --filter @carres/shared test -- purchasing-po-authority.test.ts purchase-order-evidence.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the additive migration**

```bash
git add supabase/migrations/0401_the_supplier_answer_never_rewrites_the_po.sql packages/shared/src/purchasing-po-authority.test.ts packages/shared/src/purchase-order-evidence.test.ts
git commit -m "feat(purchasing): govern PO dates and supplier evidence"
```

### Task 3: Complete, Paginated PO Read Model

**Files:**
- Modify: `apps/api/src/routes/operation/pos.ts`
- Modify: `apps/api/src/routes/operation/pos.test.ts`
- Modify: `apps/web/src/lib/queries.ts`
- Modify: `apps/web/src/pages/operation/use-open-work.ts`
- Modify: `apps/web/src/pages/operation/OperationWork.tsx`
- Modify: `apps/web/src/pages/operation/OperationWork.test.tsx`

**Interfaces:**
- Consumes: the authority added in Task 2 plus existing line sources, Units, Receiving sessions, Supplier DOs, claims, returns and send history.
- Produces: `operationPosListResponse` with `po_delivery_date`, evidence-rich `promises`, line damaged/wrong quantities, structured `work_owner`, cover, actual actors, and an opaque cursor with no silent record ceiling; the one central Work set projects the same PO action and exact PO deep link.

- [ ] **Step 1: Write failing API tests for full visibility and exact facts**

```ts
expect(body.pos[0]).toMatchObject({
  placed_at: "2026-08-28T08:00:00Z",
  po_delivery_date: "2026-09-10",
  work_owner: { normal_user_id: "user-duty", acting_user_id: "user-cover" },
});
expect(body.pos[0].purchase_order_lines[0]).toMatchObject({ damaged_qty: 1, wrong_item_qty: 1 });
expect(body.pos[0].promises[0]).toMatchObject({ channel: "whatsapp", reported_by_name: "Yee Jean", recorded_by_name: "Jess" });
expect(secondPage.pos.map((po) => po.id)).not.toContain(firstPage.pos.at(-1)?.id);
expect(poWork.href).toBe("/operation/procurement?po=PO-2032&action=supplier-date");
expect(myWorkPoItem.key).toBe(registerPoItem.key);
```

- [ ] **Step 2: Run the focused API tests and confirm they fail**

Run: `pnpm --filter @carres/api test -- src/routes/operation/pos.test.ts`

Expected: FAIL on missing official date/evidence/owner fields and pagination contract.

- [ ] **Step 3: Extend the server projection and browser types**

```ts
export interface operationPosListResponse {
  pos: operationPoListRow[];
  nextCursor: string | null;
  destinations: DestinationRow[];
  referencedDestinations: DestinationRow[];
  messageTemplate: string | null;
}
```

Read every requested page with a stable `(placed_at,id)` cursor. Resolve people through `app_users`; never send bare UUIDs as operator-facing identity. Keep `Related To` from governed sources only. Compose PO work once from the shared derivation, append it to `useOpenWorkSet`, and make `OperationWork` open its supplied `href`; My Work, Team Work and the Register must carry the same stable key and action deep link. Do not join or write Receiving truth into PO tables.

- [ ] **Step 4: Re-run focused API tests**

Run: `pnpm --filter @carres/api test -- src/routes/operation/pos.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the read model**

```bash
git add apps/api/src/routes/operation/pos.ts apps/api/src/routes/operation/pos.test.ts apps/web/src/lib/queries.ts apps/web/src/pages/operation/use-open-work.ts apps/web/src/pages/operation/OperationWork.tsx apps/web/src/pages/operation/OperationWork.test.tsx
git commit -m "feat(purchasing): expose complete PO register facts"
```

### Task 4: Supplier Answer and Outbound Evidence Doors

**Files:**
- Modify: `apps/api/src/routes/operation/pos.ts`
- Modify: `apps/api/src/routes/operation/pos.test.ts`
- Modify: `apps/web/src/lib/queries.ts`
- Modify: `apps/web/src/pages/operation/components/PoIssueEvidence.tsx`
- Modify: `apps/web/src/pages/operation/components/PoIssueEvidence.test.tsx`
- Create: `apps/web/src/pages/operation/purchase-orders/SupplierAnswerForm.tsx`
- Create: `apps/web/src/pages/operation/purchase-orders/SupplierAnswerForm.test.tsx`

**Interfaces:**
- Consumes: `purchasing_record_supplier_answer`, Supabase signed upload, exact-version `confirm-sent`.
- Produces: `useRecordSupplierAnswer(poId)`, `SupplierAnswerForm`, and optional outbound screenshot upload while preserving `PoIssueEvidence` as the single communication area.

- [ ] **Step 1: Write failing evidence journey tests**

```ts
expect(screen.getByRole("button", { name: "Record supplier date" })).toBeEnabled();
expect(JSON.parse(request.body)).toMatchObject({ answer: "same_as_po", channel: "whatsapp", evidencePath: "PO-2032/answer.png" });
expect(screen.getByText("Evidence is required")).toBeInTheDocument();
expect(openChannel).not.toHaveBeenCalledWith(expect.objectContaining({ complete: true }));
```

- [ ] **Step 2: Run focused API/component tests and confirm they fail**

Run: `pnpm --filter @carres/api test -- src/routes/operation/pos.test.ts && pnpm --filter @carres/web test -- src/pages/operation/components/PoIssueEvidence.test.tsx src/pages/operation/purchase-orders/SupplierAnswerForm.test.tsx`

Expected: FAIL because the supplier-answer form/endpoint and screenshot field are absent.

- [ ] **Step 3: Implement atomic answer and optional outbound screenshot recording**

```ts
export type RecordSupplierAnswerInput = {
  answer: "same_as_po" | "changed_date";
  supplierDeliveryDate: string;
  channel: "whatsapp" | "email" | "phone" | "in_person";
  evidencePath?: string;
  evidenceNote?: string;
  supplierAnsweredAt: string;
  reportedByUserId: string;
  reason?: string;
  remarks?: string;
};
```

Upload first, then call the one RPC; if upload or RPC fails, show the concrete two-line problem/action and leave Work open. Do not mark a door-open event complete. Keep the actual authenticated recorder server-owned.

- [ ] **Step 4: Re-run focused evidence tests**

Run the commands from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit evidence doors**

```bash
git add apps/api/src/routes/operation/pos.ts apps/api/src/routes/operation/pos.test.ts apps/web/src/lib/queries.ts apps/web/src/pages/operation/components/PoIssueEvidence.tsx apps/web/src/pages/operation/components/PoIssueEvidence.test.tsx apps/web/src/pages/operation/purchase-orders/SupplierAnswerForm.tsx apps/web/src/pages/operation/purchase-orders/SupplierAnswerForm.test.tsx
git commit -m "feat(purchasing): record supplier answers with evidence"
```

### Task 5: Approved Purchase Orders Register UI

**Files:**
- Modify: `apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.tsx`
- Modify: `apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–4 read model and pure derivations.
- Produces: approved full PO Register with 240px hideable rail, exact columns, expandable goods, Columns catalogue, safe outputs and object deep links.

- [ ] **Step 1: Replace old UI assertions with the approved Register contract**

```ts
expect(grid).toHaveTextContent("PO No | PO Issued | Supplier | Items | Related To | Deliver To | PO Delivery Date | Supplier Delivery Date | Order Qty | Received Qty | Pending Delivery Qty | Status | Work");
expect(row).toHaveTextContent("PO-20260828-4827 · Version 2");
expect(row).toHaveTextContent("The PO PDF has not been sent");
expect(row).not.toHaveTextContent("Supplier Has");
expect(expansion).toHaveTextContent("Damaged Qty");
expect(expansion).toHaveTextContent("Wrong Item Qty");
```

- [ ] **Step 2: Run the Register component test and confirm it fails**

Run: `pnpm --filter @carres/web test -- src/pages/operation/purchase-orders/PurchaseOrdersPage.test.tsx`

Expected: FAIL on old columns, old copy and missing expansion.

- [ ] **Step 3: Implement the approved Register from top to bottom**

Use the `DataGrid` register grammar from Sales Orders. Put `placed_at` in `PO Issued`; render official/supplier dates separately; add `Items`, `Status`, and the line expansion; keep all records under the default filter; group optional columns under Document, Supplier, Goods, Commercial, Connections and Ownership. The Connections group includes `Supplier DO`, `GRN No` and `Goods Received At`; Ownership includes normal owner, dated cover and actual actor. Remove `Source`, `Current Version`, `Supplier Has`, `Issued`-as-send-time, `Ordered`, `Open Balance`, and `Supplier Date`.

- [ ] **Step 4: Re-run the Register test**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit the Register UI**

```bash
git add apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.tsx apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.test.tsx
git commit -m "feat(purchasing): align purchase orders register UI"
```

### Task 6: PO Object, Live Official Preview and Connections

**Files:**
- Modify: `apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.tsx`
- Modify: `apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.test.tsx`
- Modify: `apps/web/src/lib/pdf/po-template.tsx`
- Modify: `apps/web/src/lib/pdf/po-template.test.ts`
- Modify: `apps/web/src/lib/pdf/types.ts`
- Modify: `docs/pdf/PO-PDF-STANDARD.md`

**Interfaces:**
- Consumes: official document payload, supplier answer form, revision mutation and existing Receiving/unit/claim readers.
- Produces: full-width read object; `Document`, `Revisions`, `History`, `Order Route`; 50/50 issue/revise surface with exact live `Official PO`; stacked narrow layout.

- [ ] **Step 1: Write failing object/PDF tests**

```ts
expect(screen.getByText("PO Issued")).toBeInTheDocument();
expect(screen.getByText("PO Delivery Date")).toBeInTheDocument();
expect(screen.getByText("Supplier Delivery Date")).toBeInTheDocument();
expect(screen.getByLabelText("Official PO")).toBeInTheDocument();
expect(screen.getByText("Receiving")).toBeInTheDocument();
expect(pdfText).toContain("PO-2032 · Version 2");
```

- [ ] **Step 2: Run object/PDF tests and confirm they fail**

Run: `pnpm --filter @carres/web test -- src/pages/operation/purchase-orders/PurchaseOrdersPage.test.tsx src/lib/pdf/po-template.test.ts`

Expected: FAIL on the old object facts and preview label.

- [ ] **Step 3: Implement the object and live preview**

Render identity/status/actions, Work, authoritative facts, goods, outbound evidence, supplier answer, Receiving/GRN, claims/returns and Official PO in that order. Issue/revise uses `grid-cols-1 min-[1130px]:grid-cols-2`; draft changes feed the preview data before save. Revisions preserve reason/changed fields/creator/time/exact-version evidence. All Receiving/GRN links are reads/deep links only.

- [ ] **Step 4: Re-run object/PDF tests**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit the PO object**

```bash
git add apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.tsx apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.test.tsx apps/web/src/lib/pdf/po-template.tsx apps/web/src/lib/pdf/po-template.test.ts apps/web/src/lib/pdf/types.ts docs/pdf/PO-PDF-STANDARD.md
git commit -m "feat(purchasing): complete governed PO object"
```

### Task 7: Shared Purchasing Dictionary and Navigation

**Files:**
- Modify: `apps/web/src/pages/portal/portal-nav.ts`
- Modify: `apps/web/src/pages/portal/purchasing-sidebar.ts`
- Modify: `apps/web/src/pages/portal/purchasing-sidebar.test.ts`
- Modify: `apps/web/src/pages/portal/PortalSidebar.test.tsx`
- Modify: `apps/web/src/pages/operation/PurchasingTabs.tsx`
- Modify: `apps/web/src/pages/operation/PurchasingTabs.test.tsx`
- Modify: `apps/web/src/pages/operation/purchasing-words.test.ts`
- Modify: `apps/web/src/pages/operation/receiving-one-door.test.ts`

**Interfaces:**
- Consumes: `COPY-STANDARD.md`, `ERP-ARCHITECTURE.md`, `ui/MASTER.md`, Purchasing MASTER.
- Produces: one expandable Purchasing navigation whose receive destination is `Receiving`, with unchanged route/key and no duplicate page.

- [ ] **Step 1: Write failing exact-word tests**

```ts
expect(receiveGroup.labels).toEqual(["Receiving"]);
expect(receiveLink.href).toBe("/operation?tab=receiving");
expect(allVisiblePurchasingWords).not.toContain("Goods Receipts");
expect(allVisiblePurchasingWords).not.toContain("PO Date");
```

- [ ] **Step 2: Run navigation/dictionary tests and confirm they fail**

Run: `pnpm --filter @carres/web test -- src/pages/portal/purchasing-sidebar.test.ts src/pages/portal/PortalSidebar.test.tsx src/pages/operation/PurchasingTabs.test.tsx src/pages/operation/purchasing-words.test.ts src/pages/operation/receiving-one-door.test.ts`

Expected: FAIL while the old destination word remains.

- [ ] **Step 3: Change only the shared navigation seam**

Keep the existing route, key, expansion, active-row and permission behavior. Change the visible destination/header word to `Receiving`; do not redesign the Receiving or Manual Purchase page.

- [ ] **Step 4: Re-run navigation/dictionary tests**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit the shared seam**

```bash
git add apps/web/src/pages/portal/portal-nav.ts apps/web/src/pages/portal/purchasing-sidebar.ts apps/web/src/pages/portal/purchasing-sidebar.test.ts apps/web/src/pages/portal/PortalSidebar.test.tsx apps/web/src/pages/operation/PurchasingTabs.tsx apps/web/src/pages/operation/PurchasingTabs.test.tsx apps/web/src/pages/operation/purchasing-words.test.ts apps/web/src/pages/operation/receiving-one-door.test.ts
git commit -m "fix(purchasing): use the governed Receiving word"
```

### Task 8: Delivery Gates and Real Browser Owner Walk

**Files:**
- Modify only if a gate exposes a scoped defect in the files above.
- Create: `docs/proofs/2026-08-30-purchase-orders-owner-walk.md`

**Interfaces:**
- Consumes: the complete feature and repository gate scripts.
- Produces: test/build proof, desktop/narrow screenshots and a production-migration hold statement.

- [ ] **Step 1: Run focused tests**

Run: `pnpm --filter @carres/shared test -- purchase-order-register.test.ts purchasing-po-authority.test.ts purchase-order-evidence.test.ts && pnpm --filter @carres/api test -- src/routes/operation/pos.test.ts src/routes/operation/pos-print.test.ts && pnpm --filter @carres/web test -- src/pages/operation/purchase-orders/PurchaseOrdersPage.test.tsx src/pages/operation/components/PoIssueEvidence.test.tsx src/pages/operation/purchase-orders/SupplierAnswerForm.test.tsx src/lib/pdf/po-template.test.ts`

Expected: PASS.

- [ ] **Step 2: Run repository gates**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm migration:check`

Expected: every configured gate PASS; no production migration command is run.

- [ ] **Step 3: Run authenticated desktop owner walk**

At 1440×900, prove: every governed PO is visible; exact default columns; goods expansion; identity/version; issue current PDF; opening a channel leaves work open; confirming exact version closes it; supplier answer with evidence; Revisions/History/Order Route; Receiving/GRN/claim/return links.

- [ ] **Step 4: Run authenticated narrow owner walk**

At 390×844 and 1129×900, prove: filter rail opens/closes; table remains scrollable; object facts remain readable; 50/50 work stacks with the action above the full Official PO.

- [ ] **Step 5: Save proof and commit**

```bash
git add docs/proofs/2026-08-30-purchase-orders-owner-walk.md
git commit -m "test(purchasing): prove purchase orders owner journey"
```

Record that migration 0400/0401 are delivered but not applied to production, and that merge/deploy remain unapproved.
