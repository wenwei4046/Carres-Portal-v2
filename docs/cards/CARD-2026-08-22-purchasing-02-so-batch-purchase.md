# PURCHASING — CARD 02 · REBUILD SO BATCH PURCHASE REGISTER AND COMPLETE THE GUIDED PO ISSUE JOURNEY

**Module:** Purchasing · **Sequence:** 02
**Owner authority:** `docs/purchasing/MASTER.md` §§2, 5–9, 13–15 — approved / locked 2026-08-22
**Status:** BUILT — all eight tasks executed, all gates green, six-view walk captured 2026-08-22.
Stopped at the merge boundary per §9 Task 8 and §14; migration 0376 is written and validated, NOT applied.
**Lane:** BUILD / DELIVERY
**Depends on:** `PURCHASING — CARD 01 · FIX SIDE MENU TO THE FINAL 4-GROUP / 11-PAGE LISTING`
**Base:** local `main` containing commits `7de0a27a` and `0f52e23c`

> **For the build agent:** read `CLAUDE.md`, `docs/purchasing/MASTER.md`,
> `docs/ui/MASTER.md` §§4–4.2 and 6.5–6.7, and the Purchasing section of
> `docs/COPY-STANDARD.md` first. Use `superpowers:subagent-driven-development` or
> `superpowers:executing-plans` as required by the chosen execution method. Engineering owns the
> implementation method and delivery gates; do not return technical choices to the owner.

---

## 1 · Goal

Replace the experience-heavy `SO Batch Purchase` page with one guided, full-width Purchasing
Register that tells any authorised operator:

1. what an SO still needs Carres to buy;
2. what blocks the buy and who must fix it;
3. how much Stock and Open PO already cover it;
4. where the supplier must deliver each quantity;
5. the actual date the goods must reach Carres;
6. which POs the system will create; and
7. which exact PDF still has to reach which supplier.

The operator must not know the old document sequence, remember PO days, add quantities by hand or
mistake opening WhatsApp/email for sending a PO.

This is one vertical slice: SO demand → batch selection → `Deliver To` arrangement → governed PO
creation → 50/50 PDF check → confirmed outbound evidence. After that, `Purchase Orders` owns the
supplier promise, revisions and receipt balance.

## 2 · Current defect → approved correction

| Current implementation | Problem | Final target |
|---|---|---|
| `OperationToOrder.tsx` is a 2,829-line PO Schedule/category workspace | Staff must understand calendar buckets and old page history | Approved Register Template with six concrete buying/work facets |
| Separate `Purchase Demands` page repeats demand explanation | `purchase_demand` is truth, not a destination | Converge its useful Register capability into SO Batch Purchase; retire the page |
| `Today`, `Overdue`, PO-day rows and category walking order drive the left rail | Relative time and personal habits do not say what is wrong | `Ready to buy`, four named blockers and `Covered — no buying needed` |
| Current table uses legacy `DataTable` | Required / Stock / Open PO / Buy are hard to check together | Shared `DataGrid` and the final default columns |
| One default destination applies to the whole issue request | Staff cannot safely split `Deliver To` before issue | Default Carres Klang per buy line; inline change/split before creation |
| Issue review is a modal | A supplier document needs the governed edit/check surface | Full-screen 50% guided work + 50% live PO PDF |
| Opening WhatsApp/email calls `purchasing_record_send` | The Portal observes a door opening, not a PDF leaving | Open controls record no completion; `Record the PDF sent` records evidence |
| Existing `po_sends` rows represent external-app opens | They cannot prove the supplier received a version | Classify legacy rows as open events; only confirmed evidence completes Issue PO |
| Any Operation login can reach creation | MASTER gives issuance to Current PO Duty | Read for permitted roles; create/confirm only for current duty/authorised cover |
| Manual/typed Ready Stock demand leaks into the page | SO Batch Purchase is for uncovered SO lines only | Manual Purchase stays in its own destination and issue path |

The operating model is **RESOLVED FROM AUTHORITY**. No Owner Decision remains.

## 3 · Final page — ASCII contract

### 3.1 Register mode

```text
┌─ SO Batch Purchase · 50px Destination Header · no icon ────────────────────────────────┐
├─ Search Sales Order, customer, SKU or supplier… · Filter · Sort · Display · Export ───┤
├──── 200px local rail ────┬──────────────── full-width Register ─────────────────────────┤
│ BUYING RECORDS           │ □ Source  Required  SKU/config  Required  Stock  Open PO    │
│   Ready to buy       12  │   SO      For                             Buy                │
│   Covered             8  │                                                             │
│                          │ □ SO-1318  Fri, 28 Aug  B1201S-K    2      0       0      2  │
│ WORK TO DO             │   Kimmy              Booqit · Beige                         │
│   No customer date    3  │   Hooka · Carres Klang · Goods must arrive Wed, 19 Aug     │
│   No SKU              1  │   Ready to buy                                            │
│   No supplier         2  │   [YJ] Issue PO to Hooka                                  │
│   No production days  1  │                                                             │
│                          │ □ SO-1321  No customer date ...                             │
│                          │   Customer delivery date is missing                         │
│                          │   [SH] Ask customer for a delivery date                     │
├──────────────────────────┴──────────────────────────────────────────────────────────────┤
│ 20 buying lines · 31 units needed · 14 units to buy        4 selected · Issue 3 POs   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Rules:

- Listing mode is never 50/50.
- Destination Header matches Sales Orders: 50px, 24px title, no icon, breadcrumb,
  `Purchasing ·` prefix or local tab row.
- The 200px rail shows exactly the six governed states under the two headings above. It never says
  `Today`, `Tomorrow`, `Follow Up`, `Needs Attention`, `Pending`, `Waiting`, `Priority`,
  `Next Action`, `PO Schedule` or `CATEGORY`.
- Counts are buying lines, not documents or notifications. Zero prints nothing.
- Use the shared Register Template and `DataGrid`; do not create a second grid engine.
- `+ New`, `Create Purchase` and manual-purchase controls never appear here.

### 3.2 Default columns

| Order | Column | Truth / behaviour |
|---:|---|---|
| 1 | Select | Only `Ready to buy` with `Buy > 0` is selectable |
| 2 | Source SO | Link to Sales Order; customer is the quiet second line |
| 3 | Required For | Customer promise with actual weekday + date |
| 4 | SKU / configuration | Catalog SKU plus readable model/size/fabric/modules |
| 5 | Required | Customer quantity at this row's business unit |
| 6 | Stock | Usable Stock allocated/suggested by the one Stock engine |
| 7 | Open PO | Covered quantity; document numbers open Purchase Orders |
| 8 | Buy | Printed server remainder; never editable |
| 9 | Supplier | Approved Supplier Master name, never a placeholder |
| 10 | Deliver To | Default `Carres Klang`; editable/splittable before creation |
| 11 | Goods Must Arrive | Delivery-derived latest arrival, weekday + date |
| 12 | Work | Two-line structured fact/action with owner avatar metadata |

The default visible view is the 11 business columns after Select. `Item · Description`, Variant,
Category, detailed Coverage and technical source IDs may be optional Display fields, but may not
replace or duplicate the default truth.

### 3.3 Row inspector

One row expand has one job: explain this demand without creating a second editor.

```text
REQUIRED                 3
FROM STOCK               1
ON OPEN PO               1 · PO-20260820-4827
BUY                      1

Source                   SO-1318 · B1201S-K
Required for             Fri, 28 Aug 2026
Goods must arrive        Wed, 19 Aug 2026
Deliver to               Carres Klang
```

The arithmetic is server-owned:

```text
Buy = Required − usable Stock allocated − valid Open PO allocated
```

The inspector may link to SO, PO, Catalog or Stock facts. It may not save another `Buy`, supplier,
date or coverage value.

## 4 · `Deliver To` contract

### 4.1 Before PO creation

- Every ready row defaults to the active Purchasing default, currently `Carres Klang`.
- The operator may change a whole row through the `Deliver To` cell without a revision.
- `Split` opens a compact inline quantity allocator, not a modal or second page.
- Quantities are positive integers whose sum equals the server `Buy` quantity.
- Example:

```text
B1201S-K · Buy 11

Carres Klang        10
AL Sungai Buloh      1
                    ──
                    11 ✓
```

- `Buy 0`, unresolved blockers and inactive destinations cannot be allocated.
- Arrangement lives in the browser session until creation. Refresh returns to the server default;
  it is not a stored demand truth.
- The server rechecks remainder and destinations at Issue. Stale quantity, cancelled SO, new
  coverage or inactive destination returns a concrete row error and creates no partial PO.

### 4.2 Document grouping

The server groups selected allocations by:

```text
Supplier × Deliver To
```

One PO PDF has one supplier and one `Deliver To`. Different destinations therefore produce
different POs. Multiple SO sources may share a PO when supplier and destination match; every line
retains source SO/line attribution. Client group keys are hints only; the server recomputes them.

## 5 · Guided Issue PO journey

### 5.1 Selection and review

Selecting ready rows exposes one sticky selection bar:

```text
4 selected · 7 units · Issue 3 POs
```

`Issue PO` opens the full-screen `Review Purchase Orders` surface and preserves selection and
allocations.

### 5.2 50% work + 50% live PDF

```text
┌─ Review Purchase Orders · 1 of 3 ───────────────────────────────────────────┐
├────────────────────── 50% ─────────────────┬──────────────────── 50% ────────┤
│ HOOKA → CARRES KLANG                       │ LIVE PURCHASE ORDER PDF          │
│ Lines / source / quantity                   │                                 │
│ Transaction Cost or Free of Charge          │ PO number appears after Issue PO│
│ Procurement Partner, only when required     │ Supplier · Deliver To           │
│ Deliver To and actual date                  │ Lines · source SO · Unit IDs    │
│                                             │                                 │
│ [Back to buying]                 [Issue PO] │                                 │
└─────────────────────────────────────────────┴─────────────────────────────────┘
```

- Left is the only editable issue surface. Right uses the existing money-free PO template.
- Before creation, preview is visibly non-sendable and states the number is created by `Issue PO`.
- `Issue PO` creates all validated POs through the one `purchasing_issue_pos_batch` authority, in
  one server transaction: all official POs are created or none.
- Creation returns official PO numbers and existing Unit Register IDs; the right pane then renders
  the exact official PDF.
- Leaving after creation keeps the PO in `Purchase Orders` as `Not sent to supplier`; SO Batch does
  not offer the same remainder again because the open PO covers it.

### 5.3 Actual outbound evidence

```text
PO-2041 has not reached Hooka
Open WhatsApp group and send this PDF

[Open WhatsApp group]  [Open email]  [Download PDF]

Channel      WhatsApp
Recipient    Hooka Purchasing Group

                         [Record the PDF sent]
```

- `Open WhatsApp`, `Open WhatsApp group`, `Open email`, `Copy message`, download and print are
  tools. They do not complete Issue PO or write confirmed outbound evidence.
- After the operator actually sends the PDF, `Record the PDF sent` stores PO, current version,
  supplier, recipient, channel, actor and Malaysia time.
- Issue PO remains open until that record exists. A bare tick-box is not allowed.
- The surface advances to the next unsent PO. When all are confirmed, refresh the Register and show
  `PO issued to {supplier}` per document.
- Supplier silence never becomes `Acknowledged`. Missing supplier date is separate PO work.
- A numbered unsent PO changes in place with History. After confirmed outbound evidence, changes
  use Purchase Orders `Revise` and require new outbound evidence.

## 6 · Action and permission contract

```ts
export interface SoBatchPurchaseAction {
  trigger: "ready_to_buy" | "no_customer_date" | "no_sku" |
    "no_supplier" | "no_production_days";
  ownerRule: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerDuty: string | null;
  action: string;
  completionFact: string;
  dueDate: string | null;
  sourceObject: { type: "sales_order"; id: string; number: string };
  cover: { normalOwnerId: string | null; actingOwnerId: string | null } | null;
}
```

| Trigger | Owner rule | Completion fact |
|---|---|---|
| Customer date missing | Responsible Salesperson | Customer Delivery exists |
| SKU missing | Catalog/Master Data through Current PO Duty | Approved SKU exists |
| Supplier missing | Current PO Duty | Approved supplier relationship exists |
| Production days missing | Purchasing Settings authority | Governed supplier/category days exist |
| Ready to buy | Current PO Duty | Current PO version reached supplier with evidence |

- Permitted Operations roles may read the Register.
- Only Current PO Duty or authorised roster/buddy cover may create POs or confirm outbound evidence.
  UI hiding is convenience; API/RPC is authority.
- Manager approval owns price/commercial exceptions. Operations cannot silently accept a changed
  price or treat an unknown cost as Free of Charge.
- Principal/Owner audit access does not silently bypass Current PO Duty ownership.
- No permanent `Owner` column. Owner is structured avatar metadata in Work.

## 7 · Data and API interfaces

### 7.1 Extend the canonical demand projection

Keep `purchase_demand` hidden and extend the existing shared row instead of creating another model:

```ts
export interface PurchaseDemandRow {
  id: string;
  state: PurchaseDemandState;
  orderId: string;
  so: number | null;
  customer: string | null;
  customerDelivery: IsoDate | null;
  item: string;
  variant: string | null;
  skus: string[];
  supplierId: string | null;
  supplier: string | null;
  qtyNeeded: number;
  readyStock: number | null;
  onPo: number | null;
  poNumbers: string[];
  toBuy: number | null;

  goodsMustArrive: IsoDate | null;
  issueRef: { proposalKey: string; buildKey: string } | null;
  action: SoBatchPurchaseAction | null;
}

export interface PurchasingDestination {
  id: string;
  name: string;
  isDefault: boolean;
  active: boolean;
}

export interface SoBatchPurchaseResponse {
  today: IsoDate;
  rows: PurchaseDemandRow[];
  destinations: PurchasingDestination[];
  defaultDestinationId: string | null;
  currentPoDuty: { userId: string; name: string } | null;
  mayIssue: boolean;
}
```

`goodsMustArrive` comes from the existing server arrival engine. The web never subtracts working
days. `issueRef` exists only for a current ready engine build.

### 7.2 Pure arrangement state

```ts
export interface DestinationAllocation {
  destinationId: string;
  qty: number;
}

export interface SoBatchSelection {
  demandId: string;
  allocations: DestinationAllocation[];
}

export function defaultAllocations(
  row: PurchaseDemandRow,
  defaultDestinationId: string,
): DestinationAllocation[];

export function setDestination(
  selection: SoBatchSelection,
  destinationId: string,
  qty: number,
): SoBatchSelection;

export function validateAllocations(
  row: PurchaseDemandRow,
  allocations: readonly DestinationAllocation[],
): { ok: true } | { ok: false; message: string };
```

This module checks only that the arrangement adds back to server `toBuy`; the API repeats the check
after recomputation. No demand arithmetic lives in React state.

### 7.3 Whole-batch issue request

```ts
export const soBatchIssueInput = z.object({
  selections: z.array(z.object({
    demandId: z.string().min(1),
    allocations: z.array(z.object({
      destinationId: z.string().uuid(),
      qty: z.number().int().positive(),
    })).min(1),
  })).min(1).max(500),
  documentDecisions: z.array(z.object({
    supplierId: z.string().uuid(),
    destinationId: z.string().uuid(),
    procurementPartnerId: z.string().uuid().nullable(),
    lineDecisions: z.array(issueLineDecisionSchema),
  })).max(200),
}).strict();
```

The server:

1. resolves Current PO Duty/cover;
2. recomputes all SO demand and coverage;
3. rejects unknown, blocked, covered, cancelled or stale demand;
4. validates destination and quantity allocation;
5. groups supplier × destination itself;
6. validates current cost/FOC/partner authority;
7. calls `purchasing_issue_pos_batch` once with every official PO; and
8. returns PO IDs plus supplier/destination for the evidence step.

No client quantity, supplier, price, arrival date, PO number or Unit ID is trusted.

### 7.4 Confirmed outbound evidence

```ts
export const confirmPoSentInput = z.object({
  channel: z.enum(["whatsapp", "email", "print"]),
  recipient: z.string().trim().min(1).max(200),
  note: z.string().trim().max(300).optional(),
}).strict();
```

The migration adds explicit `external_open` versus `confirmed_sent` evidence plus recipient/current
version facts. Existing click-created rows become `external_open`; they do not become sent evidence.
Only `confirmed_sent` satisfies Issue PO and version-sharing completion.

Do not delete or reinterpret old records. History may still show that WhatsApp/email was opened,
but never as proof the supplier received the PDF.

## 8 · File map

| File | Responsibility |
|---|---|
| `packages/shared/src/purchase-demands.ts` | final row/schema/state/action words; remove page-level Purchase Demands identity |
| `packages/shared/src/so-batch-purchase.ts` | allocation, grouping key and selection summary pure functions |
| `packages/shared/src/so-batch-purchase.test.ts` | allocation and grouping contract |
| `packages/shared/src/schemas/operation.ts` | confirmed outbound input |
| `packages/shared/src/index.ts` | export final contracts |
| `apps/api/src/lib/purchase-demand-read.ts` | expose existing arrival/build refs; no second arithmetic |
| `apps/api/src/routes/operation/purchase-demands.ts` | SO Batch Register projection, destinations, duty and actions |
| `apps/api/src/routes/operation/purchase-demands.test.ts` | projection/blocker/owner/arrival/destination tests |
| `apps/api/src/routes/operation/to-order.ts` | whole-batch authoritative issue endpoint |
| `apps/api/src/routes/operation/to-order.test.ts` | stale/permission/grouping/atomicity/price/destination tests |
| `apps/api/src/routes/operation/pos.ts` | explicit confirmed-send endpoint; opens no longer complete |
| `apps/api/src/routes/operation/pos.test.ts` | confirmed evidence vs legacy open |
| `supabase/migrations/0376_po_issue_requires_confirmed_outbound_evidence.sql` | evidence kind/recipient/version, duty gates and confirmed-send RPC; re-measure the number immediately before first commit/apply |
| `apps/web/src/pages/operation/OperationToOrder.tsx` | thin Register/Issue mode orchestrator |
| `apps/web/src/pages/operation/so-batch/SoBatchRegister.tsx` | header, rail, DataGrid, inspector and selection bar |
| `apps/web/src/pages/operation/so-batch/SoBatchIssueWorkspace.tsx` | 50/50 multi-document issue journey |
| `apps/web/src/pages/operation/so-batch/DestinationAllocationEditor.tsx` | whole-row destination and quantity split |
| `apps/web/src/pages/operation/components/PoIssueEvidence.tsx` | shared external tools + explicit evidence form |
| `apps/web/src/pages/operation/OperationToOrder.test.tsx` | final integration and retired UI absence |
| `apps/web/src/pages/operation/so-batch/SoBatchRegister.test.tsx` | rail/columns/selection/inspector tests |
| `apps/web/src/pages/operation/so-batch/SoBatchIssueWorkspace.test.tsx` | 50/50/PDF/multi-document/evidence tests |
| `apps/web/src/pages/operation/OperationPurchaseOrders.tsx` | reuse evidence component; stop completion on app open |
| `apps/web/src/pages/operation/OperationPurchaseOrders.test.tsx` | outbound-evidence regression |
| `apps/web/src/pages/operation/OperationApp.tsx` | old `purchase-demands` URL redirects to SO Batch |
| `apps/web/src/pages/operation/OperationPurchaseDemands.tsx` | delete after capability convergence |
| `apps/web/src/pages/operation/OperationPurchaseDemands.test.tsx` | delete after equivalent tests move |
| `apps/web/src/pages/operation/to-order-preview.ts` | delete after final arrangement state lands |
| `apps/web/src/pages/operation/to-order-preview.test.ts` | delete after cases move to pure-state tests |
| `docs/cards/CARD-2026-08-22-purchasing-02-so-batch-purchase.md` | execution evidence and production walk |

Do not grow `OperationToOrder.tsx` back into one file. The orchestrator owns data/mode; each new
file owns one component or pure contract.

## 9 · Build tasks

### Task 1 · Lock the final Register contract with failing tests

**Files:** shared demand tests, API demand tests, `OperationToOrder.test.tsx`,
`SoBatchRegister.test.tsx`.

- [ ] Assert the six states and exact precedence from current server facts.
- [ ] Assert SO demand only; Manual Purchase/typed Ready Stock demand is absent.
- [ ] Assert `goodsMustArrive` is carried from the existing arrival engine; browser subtracts no days.
- [ ] Assert each ready row has `issueRef`, current supplier, `toBuy > 0` and PO Duty action metadata.
- [ ] Assert exact rail headings/rows and banned-word absence.
- [ ] Assert exact default column order and selection eligibility.
- [ ] Assert inspector prints the four-number arithmetic and links, with no editable `Buy`.
- [ ] Run focused tests and prove failure on the current Schedule/category implementation.

### Task 2 · Converge Purchase Demands into SO Batch Purchase

**Files:** demand/shared/API files, `OperationToOrder.tsx`, new Register files, `OperationApp.tsx`.

- [ ] Reuse the current one demand/coverage computation and shared `DataGrid`.
- [ ] Replace legacy `DataTable`, PO Schedule, category rail and relative-date logic.
- [ ] Remove `Create Purchase`, manual demand picker/cancel and recent-ordered receipt rows.
- [ ] Build Destination Header + toolbar + 200px rail + full-width Register exactly as §3.
- [ ] Keep search/filter/sort/display/export and footer summary from the Register Template.
- [ ] Redirect `/operation?tab=purchase-demands` to `/operation?tab=purchase`.
- [ ] Delete the separate page only after every useful demand explanation test has moved.
- [ ] Keep `/operation?tab=purchase` and `/operation/to-order` active aliases.

### Task 3 · Build pre-issue destination allocation

**Files:** shared pure module/tests, allocation editor, Register tests.

- [ ] Test default Carres Klang, whole-row change, two/three-way split, zero/negative/fraction,
      inactive destination and sum mismatch.
- [ ] Implement arrangement without persisting a second demand field.
- [ ] Make `Deliver To` the one editor; `Split` stays inline.
- [ ] Keep selection/allocations stable through filter/sort; reset safely when server demand or
      `toBuy` changes.
- [ ] Summarise selected lines, units and server-derived PO count.
- [ ] Prove different destinations produce different preview documents.

### Task 4 · Replace issue with one authoritative whole-batch request

**Files:** shared schema, `to-order.ts`, API tests, governed RPC migration only where required.

- [ ] Test PO Duty/cover success and every other operator refusal.
- [ ] Test stale, covered, cancelled, blocked, inactive-destination and sum-mismatch inputs create
      zero POs.
- [ ] Test server groups supplier × destination and preserves source SO/line.
- [ ] Test one request creates all documents atomically through `purchasing_issue_pos_batch`.
- [ ] Keep current transaction-cost, FOC-reason and factory-pickup-partner laws.
- [ ] Prove a price difference requiring approval stops that document; Operations cannot accept it.
- [ ] Return official IDs only after complete success.
- [ ] Ensure open PO coverage immediately prevents duplicate buying.

### Task 5 · Build the governed 50/50 issue surface

**Files:** issue workspace/test and existing PO renderer/type.

- [ ] Render one document at a time with `1 of N`, previous/next and unsent state.
- [ ] Keep editable authority/cost/partner/destination facts left and exact PDF right.
- [ ] Make pre-creation preview visibly non-sendable; after creation render official
      number/version/Unit IDs from the PO document endpoint.
- [ ] Keep 50/50 from 1130px upward; below the governed breakpoint stack work above preview without
      hiding either or creating a modal.
- [ ] Preserve selection when returning to fix a pre-creation problem.
- [ ] Never delete/recreate a numbered PO when leaving the surface.

### Task 6 · Require confirmed supplier-send evidence

**Files:** migration, shared operation schema, `pos.ts`, `PoIssueEvidence.tsx`, Purchase Orders and
both focused test files.

- [ ] Write the failing regression first: opening WhatsApp/email does not complete Issue PO.
- [ ] Re-measure the next free migration number against the execution branch and live migration
      tracker immediately before creating the migration. Rename the proposed `0376_...` file if
      that number is no longer free.
- [ ] Add explicit `external_open` and `confirmed_sent` evidence without rewriting historical rows.
- [ ] Store channel, recipient, actor, timestamp and exact PO version for every confirmed send.
- [ ] Make `Open WhatsApp`, `Open WhatsApp group`, `Open email` and `Copy message` tools only.
- [ ] Add the approved completion control `Record the PDF sent` after the operator has actually
      sent the official PDF.
- [ ] Refuse confirmation for an obsolete version, unauthorised actor, blank recipient or PO that
      has not been issued.
- [ ] Make only confirmed evidence for the current version satisfy Issue PO and supplier-shared
      revision law.
- [ ] Reuse the same evidence component and law on the Purchase Order detail page.
- [ ] Show the two-line blocker/action copy until evidence exists; never say merely `Pending`,
      `Follow up` or `Needs attention`.

### Task 7 · Retire the superseded buying surfaces

**Files:** `OperationToOrder.tsx`, `OperationApp.tsx`, retired page/preview files and all affected
tests.

- [ ] Delete the separate Purchase Demands page after its useful capability and tests exist in SO
      Batch Purchase.
- [ ] Delete the legacy preview helper after allocation/grouping/document tests cover the final
      model.
- [ ] Remove PO Schedule, category rail, Today/Overdue grouping, `Create Purchase`, `+ New`, recent
      ordered receipts and local Buy editing from this route.
- [ ] Remove unreachable imports, routes and labels; keep the old URL redirect only.
- [ ] Prove Manual Purchase remains a separate route and cannot appear inside this Register.
- [ ] Prove Goods Receipts, Purchase Returns and Claims are unchanged by this Card.
- [ ] Keep one arithmetic engine, one PO issuance authority and one outbound-evidence authority.

### Task 8 · Run delivery gates and the owner walk

**Focused commands:**

```bash
pnpm --filter @carres/shared test -- \
  src/purchase-demands.test.ts \
  src/so-batch-purchase.test.ts

pnpm --filter @carres/api test -- \
  src/routes/operation/purchase-demands.test.ts \
  src/routes/operation/to-order.test.ts \
  src/routes/operation/pos.test.ts

pnpm --filter @carres/web test -- \
  src/pages/operation/OperationToOrder.test.tsx \
  src/pages/operation/so-batch/SoBatchRegister.test.tsx \
  src/pages/operation/so-batch/SoBatchIssueWorkspace.test.tsx \
  src/pages/operation/OperationPurchaseOrders.test.tsx
```

**Repository gates:**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @carres/web check:v4
pnpm build
pnpm ci:migrations
git diff --check
```

- [ ] Run migration preflight against the execution environment before applying anything.
- [ ] Record the actual migration filename and outcome in this Card.
- [ ] Run the focused tests after each task and the full gates on the final branch.
- [ ] Use controlled fixtures only. Do not create a real supplier order, send a real supplier
      message or leave production test data.
- [ ] Complete the six-view owner walk below and attach evidence paths to this Card.
- [ ] Stop before merge/deploy and follow the repository's normal approval and delivery law.

## 10 · Explicit exclusions

This Card does **not** authorise:

- changing the Purchasing sidebar; that is Card 01;
- building Manual Purchase, receiving, Purchase Returns, Claims or showroom/consignment pages;
- changing the Sales Order customer promise, Stock availability, Delivery backward-plan or Finance
  authority;
- adding a separate Purchase Demands page, Purchasing Home, Purchasing Work, Report or Settings
  page;
- changing or renumbering document-number series, PO numbers, customer numbers or Unit IDs;
- migrating old anonymous showroom stock;
- creating a second demand arithmetic, PO issue engine or Work Engine;
- sending a real supplier PDF or message during tests or the owner walk;
- implementing work outside the files and seams named in this Card merely because nearby legacy
  code is untidy.

The page consumes the current authoritative document and Unit IDs. Any future identity-format
change requires its own authority and Card.

## 11 · Acceptance contract

The Card is complete only when every statement below is true.

### Register

- [ ] `SO Batch Purchase` opens directly to the final Destination Header, six-state left rail and
      full-width Register.
- [ ] Only uncovered SO demand appears; Manual Purchase and typed Ready Stock demand do not.
- [ ] The six state counts and row blockers come from the same server projection.
- [ ] Default columns and their order match §3.2.
- [ ] `Buy` is server-derived and read-only.
- [ ] The inspector explains `Required − Stock − Open PO = Buy` with source links.
- [ ] The page contains no `+ New`, manual demand picker, PO Schedule, category rail or recent-order
      receipt list.

### Deliver To and issue

- [ ] Every ready selected row defaults to `Carres Klang` before Issue PO.
- [ ] Operators can change the whole row or split its quantity across active destinations.
- [ ] The interface and server both require allocation total = Buy.
- [ ] One action groups selected allocations by supplier × Deliver To and creates all POs
      atomically.
- [ ] The server rechecks demand, coverage, destination, supplier, price and permission immediately
      before issue.
- [ ] A failure creates zero POs; a success immediately covers the bought quantities.
- [ ] Only Current PO Duty or its authorised cover may create and confirm.

### 50/50 and supplier evidence

- [ ] At 1130px and wider, the left working side and right PDF side each use half of the available
      content area.
- [ ] Multi-document navigation shows one supplier/destination document at a time and an honest
      `1 of N` count.
- [ ] Before creation, preview is visibly non-sendable; after creation it shows the official number,
      version and current Unit IDs.
- [ ] Opening/copying an external channel never completes Issue PO.
- [ ] `Record the PDF sent` requires channel and recipient and stores actor/time/exact version.
- [ ] Only confirmed evidence for the current version closes the Issue PO action.
- [ ] Purchase Order detail obeys the same send-evidence law.

### Language, ownership and system boundaries

- [ ] Every blocker/action uses approved two-line primary-school English.
- [ ] No banned generic wording appears: `Today`, `Tomorrow`, `Needs attention`, `Follow up`,
      `Pending`, `Waiting`, `Priority` or a generic `Next action`.
- [ ] Actions retain structured trigger, owner rule, resolved owner, action, completion fact, dated
      due, source object and cover rule.
- [ ] Sales Orders owns the customer promise; Stock owns stock truth; Purchasing owns supplier
      commitment and PO issue; Receiving owns receipt evidence.
- [ ] No browser arithmetic or duplicate owner field becomes a second truth.

## 12 · Failure conditions

Reject the implementation if any of these is observed:

- the page is still principally a PO Schedule, category list or manually entered buying screen;
- Purchase Demands remains a competing page or demand truth;
- `Buy` can be typed by an operator;
- blocked or covered demand can be selected or issued;
- the browser decides goods-arrival dates, coverage or PO grouping authority;
- the supplier/destination split is flattened into one wrong PO;
- one failed group leaves some newly created POs behind;
- a WhatsApp/email open is presented as proof of supplier receipt;
- a PO revision is treated as supplier-shared without confirmed evidence for that version;
- a generic owner, manager assignment or sentence-embedded staff name replaces the Work Engine
  contract;
- the 50/50 surface becomes a modal, hides the official PDF or changes the approved Shell/Register/
  Object Detail grammar;
- the Card changes Manual Purchase, receiving, returns, claims, Sales, Stock, Delivery or Finance
  ownership;
- the implementation creates real supplier communication or uncontrolled production data;
- focused tests, full gates, migration preflight or the owner walk are missing.

## 13 · Required owner-walk evidence

Capture and attach all six views after the gates pass:

1. **1440px Register** — Destination Header, six-state rail, exact columns, ready + blocked rows.
2. **1130px blocked row** — two-line blocker/action, owner avatar metadata and inspector arithmetic.
3. **Deliver To split** — one Buy quantity split across at least two active destinations with a
   balanced total.
4. **50/50 official PO** — left issue controls, right official PDF, `1 of N`, number/version/Unit IDs.
5. **Not yet sent** — WhatsApp/email/copy tools visible while Issue PO remains open, plus
   `Record the PDF sent`.
6. **Completed issue** — confirmed recipient/channel/time/version, batch removed from ready buying,
   and no duplicate open demand.

For each image record viewport, route, fixture identity and the authoritative fact being proved.
Visual inspection supplements tests; it does not replace them.

## 14 · BUILD-agent handoff

Execute this Card from top to toe. Read `CLAUDE.md`, `docs/ERP-ARCHITECTURE.md`,
`docs/COPY-STANDARD.md`, `docs/ui/MASTER.md`, `docs/orders/MASTER.md` and
`docs/purchasing/MASTER.md` before editing.

Start from current `main`, confirm Card 01 is already present, re-measure migration numbering and
work in an isolated branch/worktree. Follow the tasks in order with failing tests first. Do not
restore the superseded 2026-08-18 SO Batch Purchase Card, do not redesign the sidebar and do not ask
the owner to choose technical execution details already resolved by authority.

Keep this Card updated with test evidence, migration evidence and owner-walk paths. Stop before any
merge/deploy boundary required by repository governance.

---

## 15 · Execution record — 2026-08-22

**Branch:** `claude/purchasing-02-so-batch-purchase`, cut fresh from `main` `c669ee01`
(which carries Card 01). Card commit `aecb284c` cherry-picked on as the first commit.

### 15.1 Commits

| Commit | Task | What |
|---|---|---|
| `872489d1` | — | the Card onto the branch; the 2026-08-18 Card marked SUPERSEDED |
| `eada1e01` | 1 | the demand row learns what a buy needs |
| `baadbe3c` | 2–3 | the Register and the `Deliver To` split |
| `853f58f7` | 4 | one whole-batch issue door |
| `039d5526` | 6 | migration 0376 + the confirmed-evidence door |
| `187426cc` | 5, 7 | the 50/50 journey; the old buying page retires |

### 15.2 Migration

**`0376_an_app_that_opened_is_not_a_pdf_that_arrived.sql`.** The number was re-measured
immediately before the file was written, against all four sources red line 7 names:

| Source | Highest |
|---|---|
| `supabase/migrations` in this branch | 0375 |
| every branch in the repository | 0375 |
| both `.codex/worktrees` checkouts | 0364 |
| the live tracker (`supabase_migrations.schema_migrations`) | 0374 applied |

MAX = 0375, so **0376 was free** and the Card's proposed number stood. `pnpm ci:migrations`
validates it. **It has NOT been applied** — that is the governed approval path, and §9/§14 stop
this Card at the merge boundary.

⚠️ Worth the owner knowing: repository migration **0375** is merged but not yet in the live
tracker. 0376 therefore queues behind it, and 0375 must be applied first.

### 15.3 Gates — all green on the final branch

| Gate | Result |
|---|---|
| `pnpm test` | **shared 108 files / 2571 · api 121 / 2369 · web 274 / 3220 — 8,160 tests, 0 failed, 0 stray errors** |
| `pnpm typecheck` | clean across all three packages |
| `pnpm lint` | `design-standard: no new violations` |
| `pnpm --filter @carres/web check:v4` | `v4-guard: clean.` |
| `pnpm ci:migrations` | 389 filenames validated; nothing applied |
| `pnpm build` | built, deploy proof stamped |
| `git diff --check` | clean |

**Tests-first, per task, each proved failing before it was implemented:**
`so-batch-purchase.test.ts` failed to resolve (module absent) → 31 pass ·
`purchase-demands.test.ts` 8 failed → 34 pass · API projection 15 failed → 35 pass ·
`SoBatchRegister.test.tsx` failed to resolve → 36 pass · batch issue 18 failed → 96 pass ·
`SoBatchIssueWorkspace.test.tsx` failed to resolve → 18 pass.

### 15.4 The six-view owner walk

Playwright at real viewports against the REAL components, the REAL stylesheet and the REAL shared
contracts, with the payload seeded (the live page is behind a password). The harness followed the
repository's `src/dev/route-preview.tsx` precedent and was deleted before committing.
Screenshots: `docs/evidence/purchasing-02-so-batch/`.

| # | View | Measured in the rendered DOM |
|---|---|---|
| 1 | `1-1440-register.png` · 1440×900 | header `SO Batch Purchase` · rail headings `BUYING RECORDS` · `WORK TO DO` · six states (`Ready to buy 2`, `Covered 1`, `No customer date 1`, `No SKU` — no count, `No supplier 1`, `No production days`) · the **11 columns in the approved order** · 5 rows · footer `5 buying lines · 19 units needed · 13 units to buy` · **0 banned words** · **`Buy` has no input** |
| 2 | `2-1130-blocked-row.png` · 1130×900 | fact `Customer delivery date is missing` · act `Ask customer for a delivery date` · owner chip `SH` · **the act does not carry the name** · inspector prints `REQUIRED 2 · FROM STOCK / ON OPEN PO / BUY Not counted yet · SOURCE SO-1321 · B1201S-Q · REQUIRED FOR No delivery date yet · DELIVER TO Carres Klang` · **0 inputs, 0 selects in the inspector** · the row is **not selectable** |
| 3 | `3-deliver-to-split.png` + `3b-split-applied.png` · 1440×900 | `11 / 11` balanced, no error, apply enabled → cell reads `Carres Klang 10 · AL Sungai Buloh 1` and the bar moves from `Issue 1 PO` to **`Issue 2 POs`** |
| 4 | `4-5050-review.png` · 1440×900 · `4c-5050-at-1130.png` · 1130×900 | **720 / 720** at 1440 and **565 / 565** at 1130 — each side exactly half · `1 of 2` · `Hooka → Carres Klang`, then `Hooka → AL Sungai Buloh` · **not a dialog** · preview says `This is a preview. Issue PO creates the number.` · **no send, download or confirm control exists before creation** |
| 5 | `5-not-yet-sent.png` · 1440×900 | `PO-20260822-4041 has not reached Hooka` · the three TOOLS present · `Record the PDF sent` present and **disabled with no recipient** · **0 banned words** |
| 6 | `6-confirmed-issue.png` · 1440×900 | `PO-20260822-4041 reached Hooka` · `Recorded as sent by WhatsApp` · the form locks after confirmation |

**Four real defects the walk found, all fixed rather than photographed around:**

1. `Not counted yet` — the sentence COPY-STANDARD OWES on a blocked row — truncated to
   `Not cou…`. `Stock`, `Open PO` and `Required For` widened; other columns trimmed to pay.
2. The 50/50 measured **375 / 375** inside a flex parent: the workspace never declared its own
   width. A component that lays out correctly only inside one particular parent is fragile, so
   both surfaces now declare it.
3. `Recorded as sent by WhatsApp to` could end in a dangling `to` when no recipient was held.
4. Three colour steps (`kit-blue-10`, `kit-slate-2`, `kit-slate-7`) the palette does not publish
   would have rendered as **nothing at all** — caught by `kit-palette.test`.

Two more came from the integration test rather than the walk: the Register trusted `data.rows`
existed and white-screened on a malformed payload (the orchestrator now parses the response
against the shared schema — `Nothing needs buying.` is a business answer a broken read may not
borrow), and the banned-word scan would have passed vacuously forever on the thinned orchestrator.

### 15.5 Judgment calls made under the Card's own authority

- **The group key has four parts, not two.** §4.2 requires one supplier and one `Deliver To` per
  document; it does not require the converse. Two shipped rules already partition further — a sofa
  is one PO per customer order (locked 2026-07-27) and a proposal is supplier × category. Merging
  either would be a business change this Card does not carry, so the key is
  `supplier × destination × category × (sofa ? order : "")`: strictly inside §4.2, and the only
  behaviour that changes is the one asked for.
- **`/issue-batch` is a new door beside the old `/issue`.** The old one still serves ~1,900 lines
  of guard tests and is the only issuer for nothing else now. Deleting it in the same change would
  have removed that cover in one step; it is named below as the follow-up.
- **The rail wording** was resolved from `docs/COPY-STANDARD.md`, which spells all six states, both
  headings and every fix line. The Card's §3.1 ASCII matches it exactly; MASTER §9.1's longer forms
  are the FACT line, which is what the row prints.

### 15.6 Owed, and deliberately not done here

- 🔴 **Migration 0376 is not applied.** It needs the governed production approval path, and
  repository 0375 must be applied before it.
- 🟡 **`POST …/to-order/issue` is still mounted.** Its only caller is gone. Retiring it, and moving
  its still-valuable guard tests onto `/issue-batch`, is a small follow-up scope.
- 🟡 **`documentDecisions` is accepted by the API but the 50/50 does not yet collect
  transaction cost / Free of Charge / procurement partner.** Every law is enforced server-side —
  a missing catalog cost returns `cost_required` and a factory-pickup document returns
  `pickup_partner_required`, so nothing can be issued wrongly — but an operator meeting one of
  those today is told by an error rather than by a field. The controls are the next scope.
- 🟡 The right-hand pane after creation points at the PO document endpoint; wiring the rendered
  `renderPoPdf` blob into the iframe is a small piece left with it.

**STOPPED AT THE MERGE BOUNDARY** per §9 Task 8 and §14. Not pushed, no PR, nothing deployed,
no migration applied.
