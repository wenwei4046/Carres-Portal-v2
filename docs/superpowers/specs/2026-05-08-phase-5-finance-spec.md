# Phase 5 — Finance (HQ Internal Role)

> **Status:** DRAFT — author Claude (Opus 4.7), 2026-05-08 21:35 GMT+8.
> Loo to walk Q-list (§2) section-by-section, lock decisions, then `/plan-eng-review` 锁定 architecture.
>
> **Scope guard:** Phase 5 covers ONLY HQ-internal finance role — payments / invoices / refunds / reconciliation / reports + 8 web pages. Dealer-side topup approval queue (UI) 仍归 Phase 2/3 dealer 范畴；finance 这边只暴露**审批+录款**端。Phase 6 supplier 自管发票流不在本 spec 内。

---

## 1. Context

### 1.1 业务模型 (per CLAUDE.md §17 biz model lock 2026-05-03)

- **Dealer 只卖货。客户付款给 HQ 直接。** HQ 跟 dealer 之间没有 credit/debt。
- Dealer 的 `deposit_balance` = HQ 给 dealer 预存的「下单可用余额」(例如批发优惠累积)，跟 customer-owe-HQ 是两回事。
- Phase 4 (Logistics) + Phase 6 (Supplier) + Phase 5 (Finance) 都是 HQ 内部角色。

### 1.2 Master plan §8 §651 acceptance

| ID | 验收点 | 涉及组件 |
|---|---|---|
| **A1** | 录一笔 dealer 付款，dealer 端 `deposit_balance` 反映 | `dealer_topup` RPC + Finance topup approve UI |
| **A2** | Order delivered 后能 issue invoice | `invoice_issue` RPC + AR drawer "Issue invoice" gated on `status='delivered' AND paid >= total` |
| **A3** | AR aging report 显示 30/60/90 day 桶 | `finance_ar_aging` RPC (新) + Dashboard AgingCard + AR page filter |

### 1.3 Carry-forwards 关联

- ⚠️ Pre-Chunk-1 `phase-9-pdf-cache-immutable-orders` — Phase 5 invoice PDF 实施时一并处理 (issue 后订单数据应 freeze 进 PDF metadata)
- ⚠️ Pre-Chunk-1 `phase-9-cjk-font-extended` — 发票 PDF 含中文客户名时字体覆盖
- 🆕 Phase 5 不引入新 carry-forward (期望)

---

## 2. Locked decisions (2026-05-08 21:42 GMT+8)

> ✅ All 8 Q's + 1 sub-Q locked in conversation per Loo. Spec §3-§10 reflect these answers.

| Q# | 问题 | LOCKED | Note |
|---|---|---|---|
| **Q1** | top_up approval 自动触发 `dealer_topup`？ | **A** — 新 RPC `finance_topup_approve(approval_id, method, reference, receipt_url)` wraps approval_decide + dealer_topup | 不改 0016 已部署 `approval_decide` |
| **Q2** | `invoice_issue` manual 还是 auto？ | **A** — Manual click 才出 | finance 核对 SST + 防竞态 |
| **Q3** | `bank_statements` V1 入口？ | **B** — CSV import day 1 | 月结量大纯 manual 不可用 |
| **Q3.1** | 哪一种银行 CSV 格式 V1 先 ship？ | **Maybank2u** | CSV 5 列 (date/desc/amount/balance/ref)，其他银行 Phase 9 接 |
| **Q4** | recon match V1 自动建议？ | **B** — 自动建议 top-6 candidates | proto 已有设计 (`Math.abs(outstanding-amount)` 排序) |
| **Q5** | refunds 保留 CN/RF 两类？ | **A** — 保留 | 业务语义不同：CN 冲账、RF 真退现 |
| **Q6** | AR aging 单 RPC 还是分两个？ | **A** — 单 RPC 返 rows + bucket totals | 避免 dashboard/AR 不一致 |
| **Q7** | invoice PDF 渲染位置？ | **A** — Server-side via `@react-pdf/renderer` | 不可变、可 sign URL 长期存、税务 7 年保留 |
| **Q8** | Phase 5 分 chunk？ | **A** — Chunk A (foundation, A1+A2) / Chunk B (recon+reports, A3) / Chunk C (refunds + PDF) | 跟 Phase 4.5 节奏一致 |

**Next**: `/plan-eng-review` 跑一遍 (architecture/data flow/edge cases)，然后 `/make-plan` 出 Chunk A 详细 plan。

---

## 3. Current code audit

### 3.1 What stays (no rewrite)

| 组件 | 位置 | 状态 |
|---|---|---|
| `payments` 表 | `supabase/migrations/0001_init.sql:391-407` | ✅ 完整 (direction/method/order_id/po_id/refund_id) |
| `invoices` 表 | `0001_init.sql:409-420` | ✅ 完整 (invoice_no/amount/tax_amount/voided_at) |
| `refunds` 表 | `0001_init.sql:422-435` | ✅ 完整 (status/approval_id/credit_note_no) |
| `dealers.deposit_balance numeric` | `0001_init.sql:60` | ✅ 字段在位 |
| `dealer_topup(uuid, numeric, payment_method, text, text)` RPC | `0003_rpcs.sql:322-347` | ✅ 创建 payment + bump balance + audit_log |
| `invoice_issue(uuid, numeric, numeric)` RPC | `0003_rpcs.sql:289-317` | ✅ finance/principal-only，invoice_no 自动生成 INV-YYYY-NNNN |
| `top_up_order(uuid, numeric, ...)` RPC | `0009:28` | ✅ 订单级 partial payment (跟 dealer 充值不同) |
| `approval_decide(uuid, approval_status, text)` RPC | `0016:18-77` | ✅ kind=refund 时自动改 refunds.status；kind=top_up **没有** side-effect |
| `approval_kind` enum | `0001_init.sql:42` | ✅ 含 refund/discount/new_dealer/top_up/price_change |
| `payment_method`/`payment_dir`/`refund_status` enums | `0001_init.sql:36-40` | ✅ zod 直接照抄 |
| `audit_log` 表 | `0001_init.sql:444-453` | ✅ finance 操作走这条 |
| 既有 `usePayments` / `useInvoices` / `useDealerTopup` / `useInvoiceIssue` (production reference queries.ts:240-492) | reference 只读 | ✅ 数据契约模板，Hono 实现照搬 |

### 3.2 What's net new

| 组件 | 工作量估计 |
|---|---|
| migration **0061** `bank_statements` + `reconciliations` 表 | ~80 LOC SQL |
| migration **0062** finance reporting RPCs (×7) + `finance_topup_approve` (Q1=A) | ~250 LOC SQL |
| (optional) migration **0063** CSV staging table (Q3=B 时) | ~30 LOC SQL |
| `apps/api/src/routes/finance/` 5 router files | ~600-800 LOC TS |
| `apps/api/src/lib/csv/maybank2u-parser.ts` (Q3.1=Maybank2u) | ~120 LOC TS — parses 5-col CSV (date/desc/amount/balance/ref) into `bank_statements` rows |
| `apps/web/src/pages/finance/` 8 page components | ~1500-2000 LOC TSX |
| `apps/web/src/pages/finance/FinanceApp.tsx` shell + sidebar nav | ~150 LOC TSX |
| `apps/web/src/components/finance/` shared building blocks (FinKpi, FinPill, FinPageHeader, AgingCard, CashflowCard, MatchModal, ARDrawer, APDrawer) | ~400 LOC TSX |
| `packages/shared/src/zod/finance.ts` schemas | ~150 LOC TS |
| `packages/shared/src/rpcs.ts` 增 7 entries | ~7 lines |
| `apps/web/src/lib/queries.ts` 增 finance namespace + ~12 query keys | ~50 LOC TS |
| Tests (vitest + playwright) | ~90 tests |

### 3.3 Reference proto files used

| 文件 | 字节 | 用途 |
|---|---|---|
| `proto/finance.jsx` | 7K | shell + sidebar 8-tab + 3 shared building blocks |
| `proto/finance-data.jsx` | 8.6K | derive helpers (deriveReceivables, derivePayables, deriveAging, deriveCashflowSeries, deriveMonthlyPL, deriveTopSkus) — **Phase 5 后端把这些下放到 RPC** |
| `proto/finance-dashboard.jsx` | 10.7K | 4 KPIs + cashflow sparkline + AgingCard + activity feed + ready-to-pay queue |
| `proto/finance-ar.jsx` | 13.3K | filter bar + 3 KPIs + table + ARDrawer (record receipt 是关键 mutation) |
| `proto/finance-ap.jsx` | 11.6K | 5-tab + 3 KPIs + table + APDrawer (3-way match + Schedule/MarkPaid) |
| `proto/finance-payments.jsx` | 6K | 4-bucket order payment view (read-only — 关键发现，无 mutation) |
| `proto/finance-invoices.jsx` | 5.4K | 4-tab + tax breakdown + PDF download |
| `proto/finance-refunds.jsx` | 8K | 3 KPIs + Issue 表单 (kind toggle credit/refund) + RM 1000 阈值 fires approval |
| `proto/finance-recon.jsx` | 9.6K | 4 KPIs + bank line table + MatchModal (top-6 suggestions) + Import button |
| `proto/finance-reports.jsx` | 7.6K | period dropdown + 4 KPIs + P&L 6-month table + revenue trend SVG line + Top SKUs bars + Export PDF |

---

## 4. Per-page UI inventory (proto-derived)

> Numbers in [brackets] = `reference/proto/finance-*.jsx:LINE`. 改动以下 UI 之前必看 proto。

### 4.1 `FinanceApp.tsx` — shell

- Sidebar 240px width，4 grouping: Overview / Receivables & Payables / Documents / Books
- 8 tabs: `dashboard` / `ar` / `ap` / `payments` / `invoices` / `refunds` / `recon` / `reports`
- Active tab indicator: 3px brand-signature 左 border + base-100 背景
- AR badge = 当前 `outstanding > 0` 的 receivable 数量
- AP badge = 当前 `payStatus === "matched"` 的 PO 数量 (注意：proto 里 `arBadge`/`apBadge` 由 `deriveReceivables/derivePayables` 算 — Phase 5 改成 dashboard summary RPC 一次性返回)
- User chip: "Finance Manager · HQ · Read & Record" (bottom-left)
- Toast container fixed bottom-right (proto:28-46)

### 4.2 `FinanceDashboard.tsx`

- **4 KPIs (top row)**: AR Outstanding (warn) / Overdue >30d (danger) / AP Due / Net cash 12 wks (ok) — 全部从 `finance_dashboard_summary()` 单 RPC 返
- **CashflowCard** [`finance-dashboard.jsx:143-177`]: SVG 12-week 双 bar (in green / out signature)
- **AgingCard** [`finance-dashboard.jsx:179-205`]: 4 buckets (0–30/31–60/61–90/90+)，每桶 horizontal bar + 金额 + count
- **Activity feed**: 8 items 拼自 orders.slice().reverse().slice(0,6) + POs.slice(0,3)
- **Payables ready-to-pay** card: filter `payStatus === "matched"`，显示 PO ID + supplier + 数量 × SKU + 金额 + DueIn
- **Export month-end pack** button → CSV download (AR rows + AP rows 拼一起)

### 4.3 `FinanceAR.tsx`

- 顶部 filter bar: search input (customer/dealer/INV) + status segmented (open/settled/all) + aging segmented (all/0-30/31-60/61-90/90+)
- 3 KPIs: Gross billed / Collected (% of gross) / Outstanding (warn accent)
- 主表 8 列: Invoice / Customer / Dealer / Aging pill / Total / Paid / Outstanding (signature color if >0) / Action(View)
- 行点击 → ARDrawer 右侧 480px slide
- **ARDrawer** [`finance-ar.jsx:111-226`] 关键 mutation:
  - `Record receipt` 按钮 → 展开 panel：amount 默认 = outstanding，optional bank ref → confirm 创建 `payments(direction='in', order_id=..., amount, reference, paid_at=current_date, recorded_by=auth.uid)` 并 bump `orders.paid`
  - `Send reminder` → 仅写 audit_log + toast (Phase 5 V1 不发邮件，Phase 9 接 webhook)
  - `Download invoice` → gated `order.status === 'delivered' AND paid >= total - 0.01`，否则 toast warn

### 4.4 `FinanceAP.tsx`

- 5-tab 横向 tab bar: Ready to pay (warn) / Scheduled / Paid (ok) / In transit / In production
- 3 KPIs: Ready to pay (warn accent) / Paid this month (ok) / Total exposure
- 主表 7 列: PO# / Supplier / SKU / Qty / Match (3-pill PO+DO+INV) / Total / Action(View)
- **APDrawer** [`finance-ap.jsx:88-176`]:
  - Total + DueIn KPIs (DueIn < 7 → warn)
  - 3-way match card：MatchRow × 3 (Purchase Order / Delivery Order / Supplier Invoice) — 各 ✓/○ icon
  - Lines breakdown table (>1 行时显示)
  - PO history (从 `purchase_orders.history` JSON 读)
  - Workflow: matched → `Schedule payment` (改 payStatus=scheduled) → `Mark as paid` (改 payStatus=paid + 创建 `payments(direction='out', po_id=..., amount=p.total)`)

### 4.5 `FinancePayments.tsx` (Order Payments — 视图)

- 4-bucket filter: All / Unpaid / Deposit < 50% / Partial paid / Fully paid
- 3 KPIs: Gross order value / Collected / Balance to collect
- 主表 7 列: DL / Customer / Dealer / Total / Paid / Balance / Progress %bar
- **READ-ONLY** — 不需要单独 mutation route，纯视图 (可复用 `usePayments({ orderId })` + `useOrders()`)

### 4.6 `FinanceInvoices.tsx`

- 4-tab: All / Unpaid / Partial / Paid (status 由 `outstanding === 0 ? "paid" : paid === 0 ? "unpaid" : "partial"` 派生)
- 3 KPIs: Gross billed / Net (excl. tax) / SST collected — **8% 含税公式** `tax = total * 0.08 / 1.08`
- 主表 8 列: Invoice / Customer / Dealer / Issued / Net / SST / Status / Action(PDF)
- `+ New invoice` 按钮 — proto 现是 toast "Invoices auto-generate when an order is placed in the dealer portal" 的占位 — Phase 5 改成**真正的 manual issue 入口**(对应 A2 acceptance)
- PDF download gated 同 ARDrawer

### 4.7 `FinanceRefunds.tsx`

- 3 KPIs: Issued / Pending (danger accent) / Applied as credit (ok)
- 主表 7 列: Note ID / DL / Customer / Reason / Amount / Status pill / Date
- ID 前缀: `CN-{N}` for credit notes (status: issued | applied)；`RF-{N}` for refunds (status: pending | approved | paid)
- `+ Issue credit note` modal:
  - kind toggle: credit | refund
  - inputs: DL / customer / amount / reason
  - Submit 逻辑: `kind=refund AND amount > 1000` → 创建 approval 记录 status=pending；其他情况直接 issue
  - Audit log 同时写入
- 底部 footer 提示语: "Credit note 减少应收；Refund 真退现"

### 4.8 `FinanceRecon.tsx`

- 4 KPIs: Inflow 7d (ok) / Outflow 7d (warn) / Matched / Unmatched (danger if >0)
- 主表 5 列: Date / Description / Amount (signed +/-) / Match pill / Action
- Action: `Match…` (未匹配) / `Open` (已匹配，看详情)
- `Import statement` button → V1 mock，V2 真 CSV upload
- **MatchModal** [`finance-recon.jsx:83-132`]:
  - 列出 top-6 candidates，按 `Math.abs(outstanding - bankAmount)` 排序
  - radio 选 candidate → Confirm match
  - 完美匹配 (`< 1`) candidate 数字显 success 绿
- **OpenMatchModal** read-only 看 5 行 fields

### 4.9 `FinanceReports.tsx`

- Period dropdown: Last 6 months / YTD 2026 / Last 12 months
- 4 KPIs: Revenue Apr (with MoM%) / COGS / Net profit (margin% accent ok) / Opex
- P&L table 6 列 × 6 月: Month / Revenue / COGS / Gross profit / Opex / Net
- Revenue trend SVG line chart (signature color polyline + dots)
- Top SKUs card: 8 SKU × bar 进度条 (signature color)
- `Export PDF` button → CSV (proto 实际是 CSV，名 PDF 是误导；Phase 5 真出 PDF via @react-pdf — 跟 invoice PDF 同 generator)

---

## 5. API design — `apps/api/src/routes/finance/`

> 5 router files mounted at `/api/finance/*`。所有路由走 `requireFinanceOrPrincipal` per-route guard (per Phase 4.5 Chunk 2 CF #1 教训：不用 `use("*", ...)` blanket middleware)。

### 5.1 `payments.ts` — 8 routes

| Method | Path | RPC / Direct | Body |
|---|---|---|---|
| GET | `/payments` | direct select with filters | `?orderId&dealerId&direction&from&to&limit` |
| POST | `/payments/topup-approve` | `finance_topup_approve` (新 RPC, Q1=A) | `{ approvalId, method, reference?, receiptUrl? }` |
| POST | `/payments/order-receipt` | `finance_record_receipt` (新 RPC) | `{ orderId, amount, method, reference? }` |
| POST | `/payments/po-pay` | direct insert payments(direction='out') + update PO.payStatus='paid' | `{ poId, amount, method, reference? }` |
| POST | `/payments/po-schedule` | direct update PO.payStatus='scheduled' | `{ poId, scheduledFor: date }` |
| GET | `/payments/:id` | direct select | — |

### 5.2 `invoices.ts` — 4 routes

| Method | Path | RPC / Direct | Body |
|---|---|---|---|
| GET | `/invoices` | direct select join orders for status | `?status&from&to&dealerId` |
| POST | `/invoices/issue` | `invoice_issue` 既有 RPC | `{ orderId, amount, taxAmount? }` (tax 默认按 8% inclusive split) |
| POST | `/invoices/:id/void` | direct update voided_at + audit | `{ reason }` |
| GET | `/invoices/:id/pdf` | server-side render via `@react-pdf/renderer` (Q7=A) | — (returns signed Storage URL) |

### 5.3 `refunds.ts` — 5 routes

| Method | Path | RPC / Direct | Body |
|---|---|---|---|
| GET | `/refunds` | direct select | `?status&dealerId&from&to` |
| POST | `/refunds/create` | wraps insert + (if amount > 1000) create approvals row | `{ orderId, dealerId?, amount, reason, kind: 'credit' \| 'refund' }` |
| POST | `/refunds/:id/pay` | new RPC `refund_pay(refund_id, method, reference)` — sets status=paid + creates payments(direction='out', refund_id) | `{ method, reference }` |
| POST | `/refunds/:id/apply` | for credit notes: sets status='applied', deducts from new order at order_create time | `{ targetOrderId }` |
| POST | `/credit-notes/issue` | direct insert (status='issued', kind='credit') | `{ orderId, dealerId?, amount, reason }` |

### 5.4 `reconciliation.ts` — 6 routes

| Method | Path | RPC / Direct | Body |
|---|---|---|---|
| GET | `/bank-statements` | direct select | `?from&to&matched=bool` |
| POST | `/bank-statements` | direct insert | `{ statementDate, description, amount, reference?, currency? }` |
| POST | `/bank-statements/import` | CSV parse + bulk insert (Q3=B 时启用) | multipart `file` + `mapping` |
| GET | `/reconciliations/suggest/:bankStatementId` | new RPC `finance_recon_suggest_matches` (Q4=B) | — (returns top-6 candidates) |
| POST | `/reconciliations` | direct insert + update bank_statement.matched ref | `{ bankStatementId, paymentId? \| invoiceId? \| refundId? \| manualRef? }` |
| DELETE | `/reconciliations/:id` | direct delete + clear bank_statement.matched | — |

### 5.5 `reports.ts` — 6 routes

| Method | Path | RPC | Returns |
|---|---|---|---|
| GET | `/reports/dashboard-summary` | `finance_dashboard_summary()` | `{ ar: { outstanding, overdueAmt, overdueCount, count }, ap: { dueAmt, count }, cashflow12w: { in, out }, agingBuckets }` |
| GET | `/reports/ar-aging` | `finance_ar_aging()` (Q6=A 单 RPC) | `{ rows: ARRow[], buckets: { '0-30': ..., '31-60': ..., '61-90': ..., '90+': ... } }` |
| GET | `/reports/ap-aging` | `finance_ap_aging()` | `{ rows: APRow[], byPayStatus: {...} }` |
| GET | `/reports/cashflow` | `finance_cashflow_series(p_weeks int)` | `{ labels, inflow, outflow }` |
| GET | `/reports/monthly-pl` | `finance_monthly_pl(p_months int)` | `{ rows: PLRow[] }` |
| GET | `/reports/top-skus` | `finance_top_skus(p_limit int)` | `{ rows: TopSkuRow[] }` |

### 5.6 zod schema location

`packages/shared/src/zod/finance.ts` (新文件)，依 §9.5 跟既有 dealer/order schemas 同 pattern。三个 enum 全部从 db-types 复用 (`paymentMethodEnum`, `paymentDirEnum`, `refundStatusEnum`)。

---

## 6. Schema delta — new migrations

### 6.1 `0061_finance_recon_tables.sql`

```sql
create table bank_statements (
  id              uuid primary key default gen_random_uuid(),
  statement_date  date not null,
  description     text not null,
  amount          numeric(12,2) not null,        -- signed: positive=inflow, negative=outflow
  reference       text,                          -- bank's own ref (FPX/PYMT no.)
  currency        text not null default 'MYR',
  raw_payload     jsonb,                         -- preserve raw row from CSV import
  imported_by     uuid references app_users(id),
  imported_from   text,                          -- 'manual' | 'csv'
  created_at      timestamptz not null default now()
);
create index bank_statements_date_idx   on bank_statements(statement_date desc);
create index bank_statements_amount_idx on bank_statements(amount);
create index bank_statements_ref_idx    on bank_statements(reference) where reference is not null;

create table reconciliations (
  id                  uuid primary key default gen_random_uuid(),
  bank_statement_id   uuid not null references bank_statements(id) on delete cascade,
  payment_id          uuid references payments(id) on delete set null,
  invoice_id          uuid references invoices(id) on delete set null,
  refund_id           uuid references refunds(id) on delete set null,
  manual_ref          text,
  matched_by          uuid references app_users(id),
  matched_at          timestamptz not null default now(),
  note                text,
  -- at least one of payment/invoice/refund/manual_ref must be non-null
  constraint reconciliation_target_required check (
    payment_id is not null or invoice_id is not null or refund_id is not null or manual_ref is not null
  )
);
create index reconciliations_bs_idx on reconciliations(bank_statement_id);

-- RLS: principal + finance read+write; others denied
alter table bank_statements enable row level security;
alter table reconciliations enable row level security;
create policy bs_finance_all   on bank_statements   for all using ((select app_role()) in ('principal','finance')) with check ((select app_role()) in ('principal','finance'));
create policy rec_finance_all  on reconciliations   for all using ((select app_role()) in ('principal','finance')) with check ((select app_role()) in ('principal','finance'));
```

### 6.2 `0062_finance_rpcs.sql` (~250 LOC)

7 个新 SQL 函数：

| RPC | Signature | 用途 |
|---|---|---|
| `finance_topup_approve(p_approval_id uuid, p_method payment_method, p_reference text, p_receipt_url text) returns payments` | wraps approval_decide + dealer_topup | Q1=A 答案落地 |
| `finance_record_receipt(p_order_id uuid, p_amount numeric, p_method payment_method, p_reference text) returns payments` | 创建 payments(direction='in') + bump orders.paid + audit | AR drawer Record receipt |
| `refund_pay(p_refund_id uuid, p_method payment_method, p_reference text) returns refunds` | 设 status=paid + paid_at + 创建 payments(direction='out', refund_id=p_refund_id) | refunds page Pay action |
| `finance_dashboard_summary() returns jsonb` | 单查询返 ar/ap/cashflow/aging summary | Dashboard |
| `finance_ar_aging() returns jsonb` (rows + buckets) | per-order outstanding + days + bucket，order by outstanding desc | AR page + AgingCard |
| `finance_ap_aging() returns jsonb` (rows + byPayStatus) | per-PO due + payStatus | AP page |
| `finance_cashflow_series(p_weeks int) returns jsonb` | 按 paid_at 周聚合 in/out | CashflowCard |
| `finance_monthly_pl(p_months int) returns jsonb` | revenue (orders.total delivered)、COGS (purchase_order_lines.cost)、opex (mock 4-5万 RM 暂定，跟 Loo 确认 Phase 5 是否真接 opex 来源)、net | Reports P&L |
| `finance_top_skus(p_limit int) returns jsonb` | order_lines aggregate by sku | Reports Top SKUs |
| `finance_recon_suggest_matches(p_bank_statement_id uuid) returns jsonb` (Q4=B) | top-6 closest match | MatchModal candidates |

实际 11 个 RPC，不是 7 — counted again 上头表。

### 6.3 (Optional) `0063_finance_csv_staging.sql`

仅当 Q3=B 选 day-1 CSV import 时启用。staging 表 + idempotent import RPC。`~30 LOC`.

---

## 7. Test strategy

### 7.1 vitest unit (target ~50 tests)

| Surface | 文件 | 估计测试数 |
|---|---|---|
| `apps/api/src/routes/finance/payments.test.ts` | router + auth guard + zod | 8 |
| `apps/api/src/routes/finance/invoices.test.ts` | issue + void + pdf gate | 7 |
| `apps/api/src/routes/finance/refunds.test.ts` | create + approval gate + pay + apply | 9 |
| `apps/api/src/routes/finance/reconciliation.test.ts` | bank stmt + match + suggest | 8 |
| `apps/api/src/routes/finance/reports.test.ts` | aging + cashflow + pl + topskus | 10 |
| `packages/shared/src/zod/finance.test.ts` | schema parse + reject | 8 |

### 7.2 RPC integration tests (target ~20 tests, vitest + supabase test client)

每个新 RPC 至少 2 个 case (happy + auth-deny)；topup-approve 多一个 race-condition case。

### 7.3 Web component tests (target ~25 tests)

| Page | 估计 |
|---|---|
| `FinanceApp.test.tsx` (sidebar + routing) | 4 |
| `FinanceDashboard.test.tsx` | 4 |
| `FinanceAR.test.tsx` + `ARDrawer.test.tsx` | 6 |
| `FinanceAP.test.tsx` + `APDrawer.test.tsx` | 5 |
| `FinanceInvoices.test.tsx` | 3 |
| `FinanceRefunds.test.tsx` (kind toggle + RM 1000 阈值) | 4 |
| `FinanceRecon.test.tsx` + `MatchModal.test.tsx` | 4 |
| `FinanceReports.test.tsx` | 3 |

### 7.4 Playwright E2E (3 acceptance flows)

- `phase-5-dealer-topup-approve.spec.ts` — A1: dealer 提交 top_up approval → finance 审批 → balance 反映
- `phase-5-invoice-issue-after-delivered.spec.ts` — A2: order 走完 → finance issue invoice → AR 显示 status=paid
- `phase-5-ar-aging-buckets.spec.ts` — A3: seed 4 不同 age 的订单 → AR page 4 桶各显 1 条 + 数额对

总计: **~98 个新测试**，目标 871 → ~969 (+98)。

---

## 8. Phasing — Phase 5 sub-chunks (Q8=A)

### Chunk A — Foundation (acceptance A1 + A2 落地)

- migration 0061 + 0062 (除 recon 相关 RPC 外的 7-8 个)
- `apps/api/src/routes/finance/payments.ts` + `invoices.ts`
- `apps/web/src/pages/finance/FinanceApp.tsx` (shell)
- `FinanceDashboard.tsx`
- `FinanceAR.tsx` + `ARDrawer.tsx`
- `FinanceAP.tsx` + `APDrawer.tsx`
- `FinancePayments.tsx`
- 估 ~5-7 天 / CC 几小时
- E2E: dealer-topup + invoice-issue (前 2 个 acceptance)

### Chunk B — Recon + Reports

- migration 0061 recon 部分 (移到 Chunk B 也行) + 0062 recon RPC + 0062 报表 RPCs
- `reconciliation.ts` + `reports.ts` routers
- `FinanceRecon.tsx` + `MatchModal.tsx`
- `FinanceReports.tsx` (P&L + Top SKUs + Export PDF)
- E2E: ar-aging 桶 (A3 acceptance)
- 估 ~2-3 天 / CC 几小时

### Chunk C — Refunds + Invoice PDF

- `refunds.ts` router (其余 endpoint)
- `FinanceInvoices.tsx` + `FinanceRefunds.tsx`
- `@react-pdf/renderer` server-side bundle for invoice PDF (复用 Phase 4.5a 已 land 的 react-pdf)
- 接 Phase 9 carry-forward `phase-9-pdf-cache-immutable-orders` (确保 invoice PDF 不被 issue 后修改)
- 估 ~2-3 天 / CC 几小时

**总 Phase 5 估**: 9-13 天人力 / ~12-18 小时 CC，跟 master plan §8 「Week 7」一致。

---

## 9. Carry-forward risks (Phase 5 期望不引入新 backlog)

- **F-11 bundle size**: Phase 4.5a 已 land `@react-pdf/renderer` (197 KiB gz)，Phase 5 不增依赖。
- **`approval_decide` 不动**: 用新 wrapper RPC `finance_topup_approve` (Q1=A)，避开 superseding migration 的复杂度。如果 Loo 改选扩 `approval_decide`，要写 0017_approval_decide_extend_topup.sql 并跑 RPC integration test 全集。
- **Recon CSV import (Q3=B)**: V1 ship 时只支持一种银行格式 (Maybank2u? CIMB? Loo 确认)，多银行格式留 Phase 9。
- **Invoice PDF storage retention**: 接 pre-Chunk-1 carry-forward `phase-4.5-do-storage-retention-policy` — 跟 DO 同 bucket policy，永久保存 (税务要求 7 年)。

---

## 10. Out of scope (defer to Phase 6+)

- Supplier 自管 invoice (Phase 6 supplier role)
- Customer-facing invoice 邮件发送 (Phase 9 email infra)
- Multi-currency (V1 MYR only)
- 跨年税务报表生成 (Phase 9)
- Bank API live integration (V1 manual + CSV，V2 接 Maybank API)
- Multi-warehouse cost allocation (Phase 6 supplier 报价多 warehouse 时)

---

## 11. Next steps after Loo locks Q1-Q8

1. Update spec §3-§10 to reflect locked answers
2. `/plan-eng-review` 跑一遍 — engineering 维度审 architecture / data flow / edge cases / test coverage
3. (optional) `/plan-ceo-review` 检 scope，万一 Loo 想 Phase 5 包含 Phase 9 的 dashboard split 之类
4. `/make-plan docs/superpowers/plans/2026-05-09-phase-5-finance-chunk-A.md` (Chunk A 单独 plan，Chunk B/C 各一份)
5. Execute Chunk A → tag `phase-5-chunk-a-complete` → /context-save → next session 续
6. `phase-5-reflection.md` after Phase 5 全收 — actual time / surprises / schema tweaks / lessons (per CLAUDE.md §6)

---

## 12. Files this spec creates / modifies

| File | Action |
|---|---|
| `supabase/migrations/0061_finance_recon_tables.sql` | new |
| `supabase/migrations/0062_finance_rpcs.sql` | new |
| `apps/api/src/routes/finance/payments.ts` | new |
| `apps/api/src/routes/finance/invoices.ts` | new |
| `apps/api/src/routes/finance/refunds.ts` | new |
| `apps/api/src/routes/finance/reconciliation.ts` | new |
| `apps/api/src/routes/finance/reports.ts` | new |
| `apps/api/src/routes/finance/index.ts` | new (sub-router mount) |
| `apps/api/src/index.ts` | edit (mount finance) |
| `apps/api/src/lib/auth-guards.ts` | edit (add `requireFinance` if not present) |
| `apps/web/src/pages/finance/FinanceApp.tsx` | new |
| `apps/web/src/pages/finance/FinanceDashboard.tsx` | new |
| `apps/web/src/pages/finance/FinanceAR.tsx` | new |
| `apps/web/src/pages/finance/FinanceAP.tsx` | new |
| `apps/web/src/pages/finance/FinancePayments.tsx` | new |
| `apps/web/src/pages/finance/FinanceInvoices.tsx` | new |
| `apps/web/src/pages/finance/FinanceRefunds.tsx` | new |
| `apps/web/src/pages/finance/FinanceRecon.tsx` | new |
| `apps/web/src/pages/finance/FinanceReports.tsx` | new |
| `apps/web/src/components/finance/*.tsx` | ~8 shared blocks (FinKpi/FinPill/AgingCard/CashflowCard/MatchModal/ARDrawer/APDrawer/MatchRow) |
| `apps/web/src/lib/queries.ts` | edit (add `qk.finance.*` namespace + ~12 keys) |
| `packages/shared/src/zod/finance.ts` | new |
| `packages/shared/src/rpcs.ts` | edit (add 11 new RPC names) |
| `packages/shared/src/db-types.ts` | edit (add `bank_statements`/`reconciliations` row types) |
| `packages/shared/src/domain.ts` | edit (add domain `BankStatement`/`Reconciliation` types) |
| `packages/shared/src/adapters.ts` | edit (add `bankStatementFromRow`/`reconciliationFromRow`) |
| `apps/api/src/routes/finance/*.test.ts` | 5 router test files |
| `apps/web/src/pages/finance/*.test.tsx` | 8 page test files |
| `apps/web/playwright/phase-5-*.spec.ts` | 3 E2E specs |
| `CLAUDE.md` | edit §17 — bump phase to Phase 5, test count, migration count |

---

> **End of spec.** Ready for §2 Q-list walkthrough with Loo, then `/plan-eng-review`.
