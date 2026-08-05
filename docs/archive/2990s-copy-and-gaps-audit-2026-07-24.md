# 2990s Copy + Carres Gaps · Audit

> **Compiled 2026-07-24 · owner Jess (COO)** · single source of truth for what
> Carres is missing vs the sister-company 2990s ERP, what to copy, what to
> build fresh, what to defer. **Read this before any new module discussion**
> so fresh chats don't re-discover the same gaps.
>
> 2990s repo (for reference · read-only from Carres side):
> `C:\Users\User\OneDrive\Desktop\2990s\`

---

## Snapshot · 2026-07-24

Carres has a strong Orders + POS + Purchase cockpit. **The gap is downstream
docs + AP + Service Case.** Purchase without GRN doc breaks supplier audit
trail; SO/Invoice without Storage persistence breaks 7-year tax retention;
no AP means Jess still tracks supplier debt in Excel.

---

## 🔴 P1 · Build within 30 days (Purchase downstream — must-ship)

Unblocks the Purchase cockpit that just shipped. Every gap here is currently
a real operator pain, not a nice-to-have.

| # | Item | 2990s source to copy from | Why P1 | Effort |
|---|---|---|---|---|
| 1 | **`pdf-common.ts` utility** — shared letterhead / header / footer / QR / signature block | `apps/backend/src/lib/pdf-common.ts` | Every future PDF (~10 of them) reuses this. Skip it and each PDF wastes 4-6h building the chrome from scratch. | 2h |
| 2 | **GRN module** — list + detail + PDF + `GrnFromPo` flow | `apps/backend/src/lib/grn-pdf.ts` + `apps/backend/src/pages/GrnFromPo.tsx` + `GrnNew.tsx` + `GoodsReceivedList.tsx` + `GoodsReceivedDetail.tsx` + `apps/api/src/routes/grns.ts` | Carres today has only `ReceivePOModal` (Check-in button) + a `receive-line` endpoint. No list to look back, no GRN PDF for supplier reconciliation, no per-GRN detail. **Operator receives goods with no audit trail.** | 1–1.5 days |
| 3 | **PO PDF template polish · Carres letterhead · NO RM** (owner lock 2026-07-24) | `apps/backend/src/lib/purchase-order-pdf.ts` | Current PO doc is basic. Adopt 2990s template + strip RM per Jess's Purchase money-hiding lock. | 2h |
| 4 | **SI (Sales Invoice) PDF + Storage 7yr persistence** — flagged in CLAUDE.md §17.5 as `phase-9-pdf-storage-persistence` | `apps/backend/src/lib/sales-invoice-pdf.ts` | Tax law: SG/MY 7-year retention. On-demand rendering breaks if the code changes. Must persist to Supabase Storage with signed URL. | 1 day |

---

## 🟠 P2 · Build within 60 days (AP kickstart + Service Case)

Formal money-out (AP) and formal customer-issue-management (Service Case) —
Carres is running both in Excel + WA today. Both go together because they
depend on P1's GRN doc.

| # | Item | 2990s source to copy | Why P2 | Effort |
|---|---|---|---|---|
| 5 | **AP kickstart · PI (Purchase Invoice) + 3-way match (PO ↔ GRN ↔ PI)** | `apps/backend/src/lib/purchase-invoice-pdf.ts` + `apps/backend/src/pages/PurchaseInvoiceNew.tsx` + `PurchaseInvoiceFromGrn.tsx` + `PurchaseInvoiceDetail.tsx` + `PurchaseInvoicesList.tsx` + `apps/api/src/routes/purchase-invoices.ts` | Once GRN has doc (P1), 3-way match is natural next step. Jess today tracks supplier debt in Excel. Aging report answers "which supplier are we behind on?" that today can't be answered. | 3 days |
| 6 | **AP · Payment Voucher (each bank transfer = one voucher, links 1+ PI, attach bank receipt)** | `apps/backend/src/pages/PaymentVoucherNew.tsx` + `PaymentVoucherDetail.tsx` + `PaymentVouchers.tsx` + `apps/api/src/routes/payment-vouchers.ts` | Money trail. Bank statement recon depends on it. Pairs with PI. | 1.5 days |
| 7 | **AP · Supplier Aging report** — 0–30d / 30–60d / 60–90d / 90+d per supplier | (build fresh · read from PI + Payment Voucher) | The daily "who to pay first" answer. One read-only page. | 4h |
| 8 | **Service Case module** (own build · **do NOT copy 2990s** · use Zendesk / ServiceNow pattern) — `service_cases` + `service_case_events` (timeline) + `service_case_attachments` (photos) + `service_case_actions` (link refund / new SO / return doc). Case Summary PDF + Resolution Letter PDF. | Zendesk / Salesforce Service Cloud / Freshdesk conceptual model. 2990s Purchase/Delivery Return docs = TRANSACTION docs, not case management. | Memory `project-so-delivered-handoff-to-service-case` locked SO Delivered = terminal + Service Case = module 6 with own 5-stage. Currently unbuilt. Post-delivery issues (fabric defect, warranty, wrong item) have no home. | 5 days (own module) |
| 9 | **DO PDF (Delivery Order)** — proper doc for partner to hand customer at delivery + get signed | `apps/backend/src/lib/delivery-order-pdf.ts` | Carres has POD upload (photo of proof) but no formal DO PDF. Partner drivers need a printable DO for customer signature. | 4h |
| 10 | **Stock Card** — single-SKU movement history one screen (every IN/OUT with source doc link) | `apps/backend/src/pages/StockCard.tsx` | Warehouse initiative needs it. Answers "why is Booqit L-arm free stock 3?" in one screen instead of grepping journal. | 1 day |

---

## 🟡 P3 · Build within 90 days (formalize the informal)

Not blocking · lifts the professionalism ceiling of the portal.

| # | Item | 2990s source to copy | Why P3 | Effort |
|---|---|---|---|---|
| 11 | **Delivery Return PDF + flow** — return goods FROM customer TO Carres | `apps/backend/src/lib/delivery-return-pdf.ts` + `apps/backend/src/pages/DeliveryReturnNew.tsx` + `DeliveryReturnFromDo.tsx` | Triggered from Service Case (P2) when action = "replacement" or "refund". Complements Service Case, doesn't replace it. | 1 day |
| 12 | **Purchase Return PDF + flow** — return goods FROM Carres TO supplier | `apps/backend/src/lib/purchase-return-pdf.ts` + `apps/backend/src/pages/PurchaseReturnNew.tsx` + `apps/api/src/routes/purchase-returns.ts` | Triggered from Service Case (P2) when action = "repair" (send back to Ohana). | 1 day |
| 13 | **Sofa Layout PDF** — spec image of the sofa build sent to customer + supplier | `apps/backend/src/lib/sofa-layout-pdf.ts` | Sofa builder engine already exists (mig 0178/0179). Customer wants the visual spec on the SO; supplier wants it to build. | 4h |
| 14 | **Stock Take (盘点) module** — periodic full inventory count + reconciliation doc | `apps/backend/src/pages/StockTakeNew.tsx` + `StockTakeDetail.tsx` + `StockTakes.tsx` + `apps/api/src/routes/stock-takes.ts` | Monthly / quarterly stocktake with audit doc. Warehouse initiative P2 has a reconcile toggle but no formal doc. | 1 day |
| 15 | **Stock Adjustment module** — one-off IN/OUT with reason (write-off, found extra, correction) | `apps/backend/src/pages/StockAdjustmentNew.tsx` + `StockAdjustments.tsx` + `apps/api/src/routes/stock-adjustments.ts` | Companion to Stock Take. Every non-transactional stock change gets a documented reason. | 4h |
| 16 | **Stock Transfer module** — move stock between warehouses / locations (Klg → PJ Showroom) | `apps/backend/src/pages/StockTransferNew.tsx` + `StockTransferDetail.tsx` + `StockTransfers.tsx` + `apps/api/src/routes/stock-transfers.ts` | Even though PJ is filtered view of Klg today, physical stock does move (loaner sofa, showroom rotation) and should have a doc. | 4h |
| 17 | **Amendments (formal SO amendment doc)** | `apps/backend/src/pages/Amendments.tsx` + `apps/api/src/routes/so-amendments.ts` | Carres has `add_order_lines` P1-P3 (line adds), but no formal Amendment doc for customer sign-off on changes. | 1 day |
| 18 | **SOP docs (5)** — copy-adapt into `docs/sop/` — `01-order-to-cash` · `02-procure-to-pay` · `03-inventory-and-costing` · `04-returns-and-reversals` · `05-quality-audit-methodology` | `C:\Users\User\OneDrive\Desktop\2990s\docs\sop\` (all 5 files) | New-hire onboarding drops from 3 days to 0.5 day. Terminology alignment across the team. Audit-ready. Adapt to Carres (skip 2990s-only concepts). | 6h |
| 19 | **Per-supplier lead time override UI** | `apps/backend/src/pages/Mrp.tsx` (`LeadTimesDialog` component) | Ohana faster than Nice Future — global lead time is a lie. UI already exists in 2990s; port. Reserved migration 0243 per `purchase-procurement-plan.md`. | 4h |

---

## ⚪ Defer (out of Carres v1 scope · confirm before building)

Confirmed with Jess these are NOT needed within 90 days. Revisit later.

| Item | 2990s source | Why defer |
|---|---|---|
| **Consignment full suite** (`Consignment*` + `PurchaseConsignment*` — 14 pages) | Multiple files | Future subscription-mattress track only. Not part of current Carres model. |
| **Fabric Tracking** | `FabricTracking.tsx` + `apps/api/src/routes/fabric-tracking.ts` | Supplier-side responsibility for Carres (Ohana manages fabric library). |
| **Fleet / Delivery Planning / Lorry Capacity** | `Fleet.tsx` + `DeliveryPlanning*` + `LorryCapacity.tsx` | Carres logistics fully outsourced (NETS / TEOW / TT / EU). Only revisit if in-house fleet ever starts. |
| **Full Accounting page** | `Accounting.tsx` | Carres uses external accountant + AutoCount historically. AP kickstart (P2 #5–7) is enough for daily ops. Full GL / P&L / balance sheet stays in the accountant's software. |
| **HR Commission + Settings** | `Hr*` | Salesperson team is small; commission tracked in Excel by Jess. Revisit at 10+ salespeople. |
| **Currencies / SSO / System Health** | `Currencies.tsx` + `Sso.tsx` + `SystemHealth.tsx` | Single-currency MYR; email login only; Cloudflare + Supabase dashboards cover system health. |

---

## Doc / PDF template inventory (11 items · sorted by priority)

Every commercial doc chain 2990s has + Carres coverage:

| Doc | 2990s template | Carres today | Priority |
|---|---|---|---|
| **SO PDF** | `sales-order-pdf.ts` | ✅ have (own version) | Compare after P1 |
| **DO PDF** | `delivery-order-pdf.ts` | ⚠️ POD upload only, no formal DO | 🟠 P2 #9 |
| **SI PDF (Sales Invoice)** | `sales-invoice-pdf.ts` | ⚠️ on-demand render, no persist | 🔴 P1 #4 |
| **PO PDF (Purchase Order)** | `purchase-order-pdf.ts` | ✅ have (basic) | 🔴 P1 #3 (polish) |
| **GRN PDF (Goods Received Note)** | `grn-pdf.ts` | ❌ | 🔴 P1 #2 (biggest gap) |
| **PI PDF (Purchase Invoice)** | `purchase-invoice-pdf.ts` | ❌ | 🟠 P2 #5 (AP) |
| **Purchase Return PDF** | `purchase-return-pdf.ts` | ❌ | 🟡 P3 #12 |
| **Delivery Return PDF** | `delivery-return-pdf.ts` | ❌ | 🟡 P3 #11 |
| **Payment Voucher PDF** | (via `PaymentVoucherDetail`) | ⚠️ storage-collect receipt exists, no formal Payment Voucher | 🟠 P2 #6 (AP) |
| **Sofa Layout PDF** | `sofa-layout-pdf.ts` | ❌ | 🟡 P3 #13 |
| **Case Summary + Resolution Letter PDF (Service Case)** | ❌ 2990s does not have this | ❌ | 🟠 P2 #8 (own build) |

**`pdf-common.ts` utility** = 🔴 P1 #1 — abstract letterhead / header / footer / QR / signature block once, all 11 PDFs reuse.

---

## Service Case · design principles (for the P2 #8 build)

Carres Service Case is a **new module Carres builds fresh** — 2990s does not
have a case-management module (their `Purchase Return` / `Delivery Return`
/ `Consignment Return` are TRANSACTION docs, not case-management).

Industry pattern (Zendesk / Salesforce Service Cloud / Freshdesk / ServiceNow):

- **Case = one customer + one issue + full timeline of events** (not a single-doc)
- **Fields:** case ID (SC-2026-NNNN) · customer + linked SO · issue type (fabric defect / wrong item / damage / warranty / delivery late / other) · severity (P1–P4) · owner (assignee) · status (5-stage: `open → investigating → repair → awaiting-customer → resolved → closed`, per memory `project-so-delivered-handoff-to-service-case`)
- **Timeline events:** every action logged with timestamp + actor + note
- **Attachments:** photos, video, customer signature
- **Actions taken (multi-select):** refund (→ Payments refund voucher) · replacement (→ new SO) · repair (→ Purchase Return · sends good back to supplier) · credit note (next order discount)
- **Cross-module links:** Case ↔ SO ↔ Purchase Return ↔ Payments refund voucher — clickable both ways
- **SLA tracking:** target close-by date; auto-escalate to Jess (COO) after 3 days no progress
- **2 PDFs:** Case Summary (internal) + Resolution Letter (customer sign-off)
- **Right rail:** case appears in Activity + Tasks widgets on the source SO's Order detail

---

## Anti-drift note for fresh chats

**If a fresh Claude / ChatGPT chat opens Carres Portal work, READ THIS FILE
FIRST + `docs/carres-portal-system-architecture.md §3` + relevant memory.**

- Carres is NOT missing "just PO PDF + SOP terms" — it's missing an entire
  downstream doc chain (GRN doc, PI, PR, PVoucher, DR, DO, Case docs).
- Carres is NOT copying 2990s wholesale — Purchase = cockpit-driven (Jess's
  call), 2990s = list-driven. Only downstream docs + utilities + SOPs port.
- Service Case is NOT a Purchase Return — build fresh per Zendesk-style pattern.
- AP = "Accounts Payable" = tracking supplier debt + paying. Jess wants
  kickstart soon (2026-07-24) — see P2 #5–7 bundle.
