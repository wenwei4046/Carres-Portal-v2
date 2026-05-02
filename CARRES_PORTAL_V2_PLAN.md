# Carres Portal v2 — Rewrite Master Plan

> **本文档是 Claude Code 执行整个 rewrite 的唯一 source of truth。**
> 任何 phase 开工前，先读完整这份文件 + 对应 zip 包内的 prototype 文件。
>
> **核心原则：Frontend is source of truth. Schema follows UI, not the other way around.**

---

## 目录

1. [项目背景与目标](#1-项目背景与目标)
2. [核心方法论：Frontend-Driven Schema Design](#2-核心方法论frontend-driven-schema-design)
3. [技术栈与架构](#3-技术栈与架构)
4. [Monorepo 结构](#4-monorepo-结构)
5. [Data Schema 总览](#5-data-schema-总览)
6. [9 个 Roles 与权限模型](#6-9-个-roles-与权限模型)
7. [核心 Workflows（State Machines）](#7-核心-workflows)
8. [Phase 0–9 详细计划](#8-phase-计划)
9. [安全 & RLS 性能策略](#9-安全--rls-性能策略)
10. [Go-Live 部署流程](#10-go-live-部署流程)
11. [Review、Test、Ship 流程](#11-reviewtestship-流程)
12. [红线与风险](#12-红线与风险)
13. [附录：文件 Reference Map](#13-附录文件-reference-map)

---

## 1. 项目背景与目标

### 1.1 现状

- **现有系统**：Carres-Portal repo（Vite + React Router 7 + Hono on CF Workers + Supabase monorepo），约 57,000 行代码，4 个 roles（Admin/Finance/Dealer/Logistics），90+ commits。**虽然挂在 production，但里面全是 testimony data，没有真实业务数据**。
- **新参考资料**：`Carres_Portal.zip` 包含完整 9-role 设计稿（proto/ + production/）。zip 是 design team 重新规划的版本，**前端 UX/UI 完全确定**，后端只完成约 60%（直连 Supabase，无 Hono 中间层）。
- **Loo 决定**：把现有 Carres-Portal 完全 rewrite 一次，按 zip 的 9-role 设计 + 现有 Hono on CF Workers 架构重新做。**因为旧系统无真实数据，不需要数据迁移**。

### 1.2 目标

✅ **MUST**：
1. 完整还原 zip 内 9 个 role 的所有 frontend 设计（按钮、跳转、modal、状态机）
2. 后端架构维持 **Hono on CF Workers 中间层**
3. Schema 完全继承 zip 的 3 个 SQL migration（零改动）
4. Cloudflare Pages（web）+ Cloudflare Workers（api）+ Supabase（db）
5. 新系统上线后即作为正式 production，旧系统直接退役

❌ **NOT in scope**：
- 任何 zip 没设计的新功能（v2 严格按 zip 设计稿做，不扩 scope）

### 1.3 不可妥协的原则

| 原则 | 含义 |
|---|---|
| **Frontend wins** | 任何 schema/API 决策必须服务 zip 的 frontend 设计。如果 zip 的 schema 跟 frontend 不一致，frontend 为准。|
| **Phase 验收驱动** | 每个 phase 必须有可验证的 acceptance criteria 才能进下一个 phase。|
| **/review 是必须的** | 涉及 RLS、auth、money、stock 的 phase 强制走 `/review` skill。|
| **遵守 global CLAUDE.md 红线** | 永不 DROP/TRUNCATE 未经显式确认；永不写 secret 进 code；不 force push。|

---

## 2. 核心方法论：Frontend-Driven Schema Design

### 2.1 为什么 Frontend 是 source of truth

zip 包的 `proto/*.jsx` 文件包含每个 role 每个页面的完整交互设计：
- 每个按钮点下去要调什么 mutation
- 每个列表 view 要 fetch 什么数据
- 每个 modal 提交后要 update 哪些字段
- 跨 role 的状态机（dealer 提交 → principal 审 → logistics 处理）怎么 sync

这些信息 **比 schema 更难重建**——schema 可以从 frontend 反推，但 frontend 反推 schema 是单向的。所以 Loo 的判断是对的：UI 已经定了，schema 必须服务 UI。

### 2.2 工作流程（每个 phase 都要走这一套）

```
Step 1: 读 proto/{role}-*.jsx 所有相关文件
        ↓
Step 2: 列出该 role 所有 UI 操作 → 数据契约（read/write）
        ↓
Step 3: 对照 production/src/lib/queries.ts 看 zip 已经怎么映射
        ↓
Step 4: 对照 production/supabase/migrations/*.sql 验证 schema 支持
        ↓
Step 5: 如有缺口 → frontend wins，调整 schema 或 RPC（罕见）
        ↓
Step 6: 写 Hono routes + apps/web 页面
        ↓
Step 7: /review → /design-review → ship phase
```

### 2.3 关键参考文件（zip 内）

| 文件 | 用途 | 处理方式 |
|---|---|---|
| `proto/*.jsx` | UI/UX source of truth | **像素级照抄设计**，但用新 stack 重写 |
| `production/src/lib/queries.ts` | 数据契约参考（read/write 模式）| **READ ONLY 参考**，新代码用 Hono 客户端，不直连 Supabase |
| `production/src/lib/adapters.ts` | snake_case ↔ camelCase 转换层 | **逻辑照抄**，搬到 `packages/shared/adapters.ts` |
| `production/src/lib/db-types.ts` | DB row types | **完全照抄**到 `packages/shared/db-types.ts` |
| `production/src/lib/domain.ts` | UI domain types | **完全照抄**到 `packages/shared/domain.ts` |
| `production/supabase/migrations/*.sql` | Schema + RLS + RPCs | **零改动 apply** 到新 Supabase |
| `MIGRATION_SPEC.md` | 1047 行 spec | 当百科全书查 |
| `shared/styles.css` + 4 个 preset | 设计 token | 移植到 Tailwind config（warm-linen 为默认）|

---

## 3. 技术栈与架构

### 3.1 Stack 矩阵

| 层 | 技术 | 版本 | 部署目标 |
|---|---|---|---|
| **Web** | Vite + React 18 + TypeScript | Vite 5+, React 18.3, TS 5.6+ | Cloudflare Pages |
| **路由** | React Router DOM | **v7**（升级 zip 的 v6）| - |
| **UI** | Tailwind CSS + shadcn/ui (Radix primitives) | Tailwind 3.4+ | - |
| **Server state** | TanStack React Query | v5 | - |
| **Client state** | Zustand | v5 | - |
| **Icons** | Lucide React | latest | - |
| **Date** | date-fns | v4 | - |
| **API** | Hono | v4 | Cloudflare Workers |
| **Validation** | zod | v3 | 前后端共用 |
| **Auth** | Supabase Auth | latest | Supabase Cloud |
| **DB** | PostgreSQL | Supabase 默认（v15+）| Supabase Cloud |
| **Storage** | Supabase Storage | - | Supabase Cloud |
| **Package mgr** | pnpm | v9+ | - |
| **Build orchestration** | Turborepo（可选） | latest | - |

### 3.2 架构总览

```
┌──────────────────────────────────────────────┐
│  Browser · Vite SPA on Cloudflare Pages      │
│  React 18 + RR7 + shadcn + React Query       │
└──────────┬───────────────────────────────────┘
           │ Authorization: Bearer <Supabase JWT>
           ▼
┌──────────────────────────────────────────────┐
│  Hono on Cloudflare Workers                  │
│  - JWT verify (jose)                         │
│  - zod payload validation                    │
│  - business rules / role gating              │
│  - cron triggers (Workers cron)              │
│  - file upload signing (R2 / Storage)        │
└──────────┬───────────────────────────────────┘
           │ user JWT (RLS) | service_role (admin/cron)
           ▼
┌──────────────────────────────────────────────┐
│  Supabase                                    │
│  Postgres + RLS + RPCs + Auth + Storage      │
└──────────────────────────────────────────────┘
```

**Auth 路径例外**：`POST /auth/v1/token`（login）browser 直接打 Supabase，不经过 Hono。拿到 JWT 后所有数据请求才走 Hono。

### 3.3 Trust Boundary

| Boundary | 谁信任谁 | 强制手段 |
|---|---|---|
| Browser → Hono | Hono **不信任** browser | jose JWT verify + zod schema validation |
| Hono → Supabase（用户操作）| Supabase **不信任** Hono | 转发用户 JWT，让 RLS 把关 |
| Hono → Supabase（admin/cron）| Supabase 信任 Hono | service_role key 仅在 Worker env，never bundled to web |

---

## 4. Monorepo 结构

```
carres-portal-v2/                       ← 新 repo
├── apps/
│   ├── web/                             ← Vite SPA → Cloudflare Pages
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx                 ← top-level routes + role gate
│   │   │   ├── index.css                ← Tailwind base + warm-linen tokens
│   │   │   ├── lib/
│   │   │   │   ├── api.ts               ← fetch wrapper（自动带 JWT）
│   │   │   │   ├── supabase.ts          ← 仅用于 auth（login/logout/reset）
│   │   │   │   ├── auth.ts              ← Zustand auth store
│   │   │   │   └── queries.ts           ← React Query hooks（call api.ts）
│   │   │   ├── components/
│   │   │   │   ├── AppShell.tsx
│   │   │   │   ├── RequireAuth.tsx
│   │   │   │   └── ui/                  ← shadcn primitives
│   │   │   └── pages/
│   │   │       ├── Login.tsx
│   │   │       ├── dealer/              ← phase 2
│   │   │       ├── salesperson/         ← phase 2
│   │   │       ├── principal/           ← phase 3
│   │   │       ├── logistics/           ← phase 4
│   │   │       ├── finance/             ← phase 5
│   │   │       ├── supplier/            ← phase 6
│   │   │       ├── partner/             ← phase 7
│   │   │       ├── showroom/            ← phase 8
│   │   │       └── bd/                  ← phase 8
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── api/                             ← Hono → Cloudflare Workers
│       ├── src/
│       │   ├── index.ts                 ← Hono app entry
│       │   ├── middleware/
│       │   │   ├── auth.ts              ← JWT verify, attach user/role
│       │   │   ├── role-gate.ts         ← role-based 路由门禁
│       │   │   └── cors.ts
│       │   ├── routes/
│       │   │   ├── catalog.ts           ← /api/catalog/*
│       │   │   ├── orders.ts            ← /api/orders/*
│       │   │   ├── dealers.ts
│       │   │   ├── suppliers.ts
│       │   │   ├── purchase-orders.ts
│       │   │   ├── stock.ts
│       │   │   ├── payments.ts
│       │   │   ├── invoices.ts
│       │   │   ├── approvals.ts
│       │   │   ├── audit.ts
│       │   │   └── inquiries.ts
│       │   ├── lib/
│       │   │   └── supabase.ts          ← createClient with user JWT or service_role
│       │   └── types.ts
│       ├── wrangler.toml                ← CF Workers config
│       └── package.json
│
├── packages/
│   └── shared/                          ← 跨前后端共用
│       ├── src/
│       │   ├── db-types.ts              ← snake_case Postgres rows（zip 照抄）
│       │   ├── domain.ts                ← camelCase domain types（zip 照抄）
│       │   ├── adapters.ts              ← row → domain 转换（zip 照抄）
│       │   ├── schemas/                 ← zod schemas
│       │   │   ├── orders.ts
│       │   │   ├── dealers.ts
│       │   │   └── ...
│       │   └── index.ts
│       └── package.json
│
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql                ← zip 直接复制（527 行）
│   │   ├── 0002_rls.sql                 ← zip 直接复制（342 行）
│   │   └── 0003_rpcs.sql                ← zip 直接复制（462 行）
│   ├── seed.sql                         ← zip 复制（demo data）
│   └── config.toml
│
├── .github/
│   └── workflows/
│       ├── deploy-web.yml               ← deploy apps/web → CF Pages
│       └── deploy-api.yml               ← deploy apps/api → CF Workers
│
├── pnpm-workspace.yaml
├── turbo.json                           ← 可选
├── package.json                         ← root
├── CLAUDE.md                            ← 项目级指令（继承全局红线）
└── CARRES_PORTAL_V2_PLAN.md             ← 本文档
```

---

## 5. Data Schema 总览

> 完整 DDL 在 `production/supabase/migrations/0001_init.sql`（527 行）。这里按 domain 分类列出。

### 5.1 Enum Types（19 个）

| Enum | 值 |
|---|---|
| `app_role` | principal, dealer, salesperson, showroom, logistics, supplier, partner, finance, bd |
| `user_status` | active, invited, disabled |
| `dealer_status` | active, suspended, pending |
| `supplier_kind` | own_logistics, factory_pickup |
| `product_category` | mattress, bedframe, sofa |
| `variant_kind` | size, preset, part |
| `stock_movement_kind` | in, out, adjust |
| `order_status` | place, proceed_order, delivered, cancelled |
| `logistics_stage` | awaiting_stock, ready_to_dispatch, dispatched, delivered |
| `partner_delivery_stage` | assigned, picked_from_wh, en_route, delivered |
| `po_status` | open, received, cancelled |
| `po_sup_status` | pending, acknowledged, in_production, shipped, delivered, ready_for_pickup, pickup_assigned, pickup_accepted, picked_up, reassign_needed |
| `po_pay_status` | unpaid, scheduled, paid |
| `payment_method` | cash, bank_transfer, cheque, credit_card, debit_card, duitnow_qr, dealer_deposit |
| `payment_dir` | in, out |
| `refund_status` | pending, approved, rejected, paid |
| `approval_kind` | refund, discount, new_dealer, top_up, price_change, other |
| `approval_status` | pending, approved, rejected |
| `inquiry_kind` | new_dealer, expansion, product |
| `inquiry_stage` | new, contacted, qualified, converted, lost |

### 5.2 Tables 分组（约 25 张）

#### Auth / Users
- `app_users` —— 镜像 auth.users + role + 实体绑定（dealer_id / supplier_id / partner_id / outlet_id）

#### Dealer Domain
- `dealers` —— 经销商主表（credit_limit、payment_terms、deposit_balance）
- `outlets` —— 门店（dealer_id 关联）
- `salespersons` —— 销售员（outlet_id 关联）

#### Catalog Domain
- `product_models` —— 商品型号（mattress/bedframe/sofa）
- `product_skus` —— 具体 SKU
- `sofa_fabrics` —— 沙发面料
- `addons` —— 附加品（pillow、mattress protector 等）

#### Inventory Domain
- `warehouses` —— 仓库
- `stock_balances` —— 当前库存（每个 SKU × 每个仓库）
- `stock_movements` —— 库存变动 log（in/out/adjust）

#### Supplier Domain
- `suppliers` —— 供应商（kind = own_logistics / factory_pickup）
- `purchase_orders` —— PO header
- `purchase_order_lines` —— PO 明细

#### Logistics Partner Domain
- `delivery_partners` —— 3PL 公司
- `partner_fleet` —— 3PL 车辆

#### Order Domain（核心）
- `orders` —— 销售订单（双 status：order_status + logistics_stage + partner_delivery_stage）
- `order_lines` —— 订单明细
- `order_history` —— 状态变更 log

#### Money Domain
- `payments` —— 收付款
- `invoices` —— 发票
- `refunds` —— 退款

#### Workflow Domain
- `approvals` —— 审批队列（refund/discount/new_dealer/top_up/price_change）
- `audit_log` —— 审计 log
- `inquiries` —— BD 商机管线

### 5.3 关键关系

```
dealers ──┬── outlets ── salespersons
          └── orders ── order_lines ── product_skus ── product_models
                     ├── order_history
                     ├── payments
                     └── invoices

suppliers ── purchase_orders ── purchase_order_lines

warehouses ── stock_balances (每个 SKU)
            └── stock_movements (log)

approvals ──→ 关联各种 entity（refund_id / dealer_id / order_id / etc）
audit_log ──→ 全局
```

### 5.4 RPCs（22 个 SECURITY DEFINER 函数）

涉及跨表 mutation 或业务规则强制的操作。完整列表在 `0003_rpcs.sql`。重点：

| RPC | 用途 | 调用者 |
|---|---|---|
| `order_proceed(order_id)` | dealer 提交 → 进入 logistics 队列 | dealer |
| `order_dispatch(order_id, ...)` | logistics 出库 | logistics |
| `order_deliver(order_id, ...)` | 送达 + 库存扣减 | logistics/partner |
| `payment_record(...)` | 录入收款 + 更新 dealer deposit | dealer/finance |
| `top_up_request(amount)` | dealer 申请充值 → 进 approval 队列 | dealer |
| `approval_decide(approval_id, decision)` | principal/finance 审批 | principal/finance |
| `stock_adjust(sku, qty, reason)` | 库存调整 + 写 movement | logistics |
| `po_acknowledge(po_id)` | supplier 确认 PO | supplier |
| ... | | |

---

## 6. 9 个 Roles 与权限模型

| Role | 简介 | 实体绑定 | 主路径 |
|---|---|---|---|
| `principal` | Carres HQ 老板 / 高管 | 无（看全局）| `/principal` |
| `dealer` | 独立经销商 | `dealer_id` | `/dealer` |
| `salesperson` | dealer 下的店员 | `dealer_id` + `outlet_id` | `/salesperson` |
| `showroom` | Carres 自营 showroom | `outlet_id`（channel='showroom'）| `/showroom` |
| `logistics` | Carres 内部仓储/采购 | 无 | `/logistics` |
| `supplier` | 工厂供应商 | `supplier_id` | `/supplier` |
| `partner` | 3PL 物流 | `partner_id` | `/delivery-partner` |
| `finance` | 内部财务 | 无 | `/finance` |
| `bd` | 业务拓展 | 无 | `/bd` |

每个用户绑定**恰好一个 role**。Role 存在 `auth.users.raw_user_meta_data.role`，且镜像在 `app_users.role`。所有 query 用 `app_users` 表，不要碰 `auth.users`（auth 流水线专用）。

---

## 7. 核心 Workflows

> State machine 详细图示在 `MIGRATION_SPEC.md §6`。这里只列关键转换。

### 7.1 Order Lifecycle

```
[dealer] place
    │ order_proceed()
    ▼
proceed_order + logistics_stage=awaiting_stock
    │ logistics 检查库存 OK
    ▼
logistics_stage=ready_to_dispatch
    │ order_dispatch()
    ▼
logistics_stage=dispatched + partner_delivery_stage=assigned
    │ 3PL 取货
    ▼
partner_delivery_stage=picked_from_wh → en_route → delivered
    │ order_deliver()
    ▼
order_status=delivered + 库存扣减 + 触发开发票
```

### 7.2 PO Lifecycle（Carres ↔ Supplier）

```
[logistics] 创建 PO
    │
    ▼
po_status=open + po_sup_status=pending
    │ supplier 确认
    ▼
po_sup_status=acknowledged → in_production → shipped → delivered
    │ logistics 收货
    ▼
po_status=received + 库存增加 + po_pay_status=unpaid
    │ finance 安排付款
    ▼
po_pay_status=scheduled → paid
```

### 7.3 Approval Workflow

```
[各 role] 触发 approval（refund / discount / new_dealer / top_up / price_change）
    │
    ▼
approvals 表 status=pending
    │
    ├── principal 看到 → 决定 approve / reject
    └── finance 看到（部分类型）→ 决定 approve / reject
    │
    ▼
status=approved/rejected + 触发对应业务动作
```

### 7.4 Payment + Deposit Workflow

```
[dealer] 下单时选 payment_method=dealer_deposit
    │
    ▼
扣 dealers.deposit_balance（余额够才能下）
    │
[dealer] 充值 → 触发 top_up approval
    │ principal/finance approve
    ▼
deposit_balance += 充值额
```

---

## 8. Phase 计划

> 总时长 **11 周**（W1–W11）。Phase 2 因为是核心 dealer flow + 用户基数最大，给 2 周。

### Phase 0 · Foundation（Week 1）

**目标**：搭好空壳 monorepo，三个 service 能本地跑 + CI 能 deploy 到 Cloudflare staging。

**任务**：
1. 创建新 repo `carres-portal-v2`（GitHub）
2. `pnpm init` + `pnpm-workspace.yaml`
3. 建 `apps/web`：Vite + React + TS + Tailwind + shadcn-ui init（按 zip 的设计 token 配 warm-linen）
4. 建 `apps/api`：Hono + Wrangler + TS
5. 建 `packages/shared`：tsconfig + 占位 export
6. 创建新 Supabase 项目，命名 `carres-portal-v2`
7. 配 `.env.example`，记录所需 env：
   - web: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`
   - api（CF Workers secrets）: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
8. 配 GitHub Actions：push to main → 自动 deploy 到 Cloudflare staging
9. 移植 zip 的 `shared/styles.css` 到 `apps/web/src/index.css` + Tailwind config（warm-linen tokens）

**Acceptance**：
- ✅ `pnpm dev` 三个 service 同时启动，`http://localhost:5173` 显示空白页
- ✅ `pnpm --filter api dev` 起 wrangler dev，`curl http://localhost:8787/health` 返回 `{ok:true}`
- ✅ Push commit → GitHub Actions 跑通 → 在 Cloudflare dashboard 看到 staging deploy
- ✅ 新 Supabase project 创建完成，URL 和 keys 记录在 `.env.example`（**注意：keys 不进 git**）

---

### Phase 1 · Schema + Auth（Week 2）

**目标**：3 个 SQL migration apply 完，Hono auth middleware 能验 Supabase JWT，Login 页能跑通。

**任务**：
1. 把 zip 的 `production/supabase/migrations/0001_init.sql`、`0002_rls.sql`、`0003_rpcs.sql` 复制到 `supabase/migrations/`，零改动
2. 用 `supabase db push` apply 到新 Supabase project
3. 跑 `seed.sql` 灌 demo data
4. 把 zip 的 `production/src/lib/db-types.ts`、`domain.ts`、`adapters.ts` 复制到 `packages/shared/src/`，零改动
5. 在 `packages/shared/src/schemas/` 写 zod schemas（前后端共用）
6. **apps/api**：
   - `middleware/auth.ts`：用 jose 验 Supabase JWT，从 JWT claim 拿 user_id，查 `app_users` 拿 role + 实体 id，attach 到 Hono context
   - `middleware/role-gate.ts`：检查 c.var.role 是否在 allowed roles 里
   - `lib/supabase.ts`：createClient 工厂，分两种 mode：用户 JWT mode（RLS 生效）、service_role mode（admin/cron 用）
   - `routes/health.ts`：`GET /health`
   - `routes/auth.ts`：`GET /api/auth/me` 返回当前 user + role
7. **apps/web**：
   - `lib/supabase.ts`：仅用于 auth（signInWithPassword / signOut / resetPassword）
   - `lib/auth.ts`：Zustand store，存 session/role/loading
   - `lib/api.ts`：fetch wrapper，自动从 Zustand 拿 JWT 加 Authorization header
   - `pages/Login.tsx`：照抄 zip 的 Login 设计（terracotta 配色 + Big Shoulders Stencil 字体）
   - `App.tsx`：基础 routes + RequireAuth gate（仅 login + 一个 dummy `/me` 页）

**Acceptance**：
- ✅ Supabase dashboard 看到 25 张表 + 19 enums + 22 RPCs 都创建成功
- ✅ seed.sql 跑完，能在 dashboard 看到 demo dealers/orders/products 数据
- ✅ 用 demo account 在 Login 页登入，跳转到 `/me`，显示当前 user + role
- ✅ `/api/auth/me` 在没 JWT 时返回 401，有有效 JWT 时返回 user info
- ✅ JWT 过期或非法时 Hono middleware 正确拒绝

**Phase 1 必走 `/review` skill**，重点审：
- JWT verify 逻辑（防止伪造 JWT 绕过）
- service_role key 是否泄露到 web bundle（grep 整个 dist/）
- RLS helper functions 是否都加了 STABLE（性能）

**风险 ⚠️**：
- 9 roles + 25 张表 → RLS policies 会非常多。**这一 phase 末尾就要做 RLS 性能 baseline 测试**（见 §9）。
- helper function `auth.app_role()` 每次 RLS 检查都查 `app_users`，应改用 JWT claim 直读（见 §9.2）。

---

### Phase 2 · Dealer + Salesperson（Week 3-4，2 周）

**目标**：dealer 和 salesperson 两个 role 完整可用。这是用户基数最大的 role，做扎实点。

**前置阅读**（Claude Code 必读）：
- `proto/dealer.jsx`（dealer shell + sidebar）
- `proto/dealer-orders.jsx`（订单看板）
- `proto/new-order.jsx` + 三个 step 文件
- `proto/dealer-products.jsx`
- `proto/dealer-settings.jsx`
- `proto/dealer-action-modals.jsx`
- `proto/dealer-mobile.jsx`（mobile 版）
- `proto/showroom.jsx`（dealer 用的展示模式）
- `production/src/pages/dealer/*` —— 看 60% 完成版怎么做的
- `production/src/lib/queries.ts` —— dealer 部分

**任务**：

A. **API routes**（apps/api/routes/）：
- `orders.ts`：list（filter dealer_id）、get、create、proceed、cancel、record_payment
- `catalog.ts`：list models / skus / addons / fabrics
- `dealers.ts`：get_self、update_self
- `outlets.ts`：CRUD（scope to self）
- `salespersons.ts`：CRUD（scope to self）
- `top-ups.ts`：request

B. **Web pages**（apps/web/src/pages/dealer/）：
- `DealerApp.tsx`：shell + sidebar（含 mobile 切换）
- `DealerDashboard.tsx`
- `DealerOrders.tsx`：Kanban (place / proceed / delivered)
- `DealerOrderDetail.tsx`：抽屉 / 全屏
- `DealerNewOrder.tsx`：3-step wizard
- `DealerProducts.tsx`
- `DealerShowroom.tsx`：客户面对面浏览
- `DealerSettings.tsx`：outlets + salespersons + deposit + profile
- modals：`TopUpDepositModal`, `RecordPaymentModal`, `FixDateModal`, `EditCustomerModal`

C. **Salesperson** = dealer shell scoped to outlet。可重用 dealer 组件，加一个 `outletScope` prop。

**Acceptance**：
- ✅ Dealer 账号能完整下一单：选客户 → 加商品 → 选付款 → 签字 → submit
- ✅ Order 出现在 "Place" kanban，点 proceed 移到 "Proceed"
- ✅ 充值申请提交后在 `approvals` 表能看到（principal 后续 approve）
- ✅ Mobile 视口（< 768px）切到底部 tab 导航
- ✅ 所有按钮跟 zip prototype 视觉 100% 一致（用 `/design-review` 验）
- ✅ Salesperson 账号只看到自己 outlet 的 order

**Phase 2 必走 `/review` + `/design-review`**。

---

### Phase 3 · Principal（Week 5）

**目标**：principal admin 全部功能。Loo 自己用 principal 账号每天上去看，能持续验证后续 phase。

**前置阅读**：
- `proto/principal*.jsx`（8 个文件）
- `production/src/pages/principal/*`

**任务**：

A. **API routes**：
- `dealers.ts`：list all、suspend、reactivate、set_credit、invite
- `suppliers.ts`：list、suspend、edit
- `pricing.ts`：upsert price、add/discontinue model
- `accounts.ts`：list users、invite、disable、change_role（用 service_role 调 Supabase admin API）
- `approvals.ts`：list、decide
- `audit.ts`：list

B. **Web pages**：
- `PrincipalApp.tsx` shell
- `PrincipalDashboard.tsx`：group-wide KPIs + urgent approvals + audit feed
- `PrincipalApprovals.tsx`
- `PrincipalDealers.tsx` + drawer
- `PrincipalSuppliers.tsx` + drawer
- `PrincipalPricing.tsx`
- `PrincipalAccounts.tsx`
- `PrincipalViews.tsx`：「View as X」impersonation
- `PrincipalAudit.tsx`

**Acceptance**：
- ✅ 上一 phase dealer 提的 top_up approval 能在 principal 这里 approve
- ✅ approve 后 dealer 端 deposit_balance 更新
- ✅ 「View as dealer」能切换视角看 dealer 视图
- ✅ Account admin 能创建一个新 supplier 用户（实际调 Supabase admin API）

**风险 ⚠️**：Account admin（创建/禁用用户）用 service_role key，**只能在 Hono 端做，绝对不能让 web 端拿到 service_role**。

---

### Phase 4 · Logistics（Week 6）

**前置阅读**：
- `proto/logistics*.jsx`（5 个文件）
- `production/src/pages/logistics/*`

**任务**：

A. **API routes**：
- `orders.ts`：扩展 dispatch、attach_do、deliver
- `stock.ts`：list balances、list movements、adjust
- `purchase-orders.ts`：list、create、receive

B. **Web pages**：
- `LogisticsApp.tsx`
- `LogisticsDashboard.tsx`
- `LogisticsOrders.tsx`：4 列 kanban
- `LogisticsOrderDetail.tsx`
- `LogisticsWarehouse.tsx`：stock balances
- `LogisticsMovements.tsx`：movement log
- `LogisticsProcurement.tsx`：PO 列表 + 创建 PO
- `LogisticsDispatch.tsx`：dispatch 操作
- modals：`DispatchModal`、`AttachDOModal`、`AdjustStockModal`

**Acceptance**：
- ✅ Phase 2 dealer 下的单跑完整流程：proceed → awaiting_stock → ready → dispatched → delivered
- ✅ Delivered 后 stock_balances 自动扣减（RPC 触发）
- ✅ `stock_movements` 写入 log

---

### Phase 5 · Finance（Week 7）

**前置阅读**：
- `proto/finance*.jsx`（10 个文件）

**任务**：

A. **API routes**：
- `payments.ts`：list、record（in/out）
- `invoices.ts`：list、issue、void
- `refunds.ts`：list、create、approve、pay
- `reconciliation.ts`：list bank statements、match
- `reports.ts`：AR aging、AP aging、cashflow

B. **Web pages**：
- `FinanceApp.tsx`
- `FinanceDashboard.tsx`
- `FinanceAR.tsx` / `FinanceAP.tsx`
- `FinancePayments.tsx`
- `FinanceInvoices.tsx`
- `FinanceRefunds.tsx`
- `FinanceRecon.tsx`
- `FinanceReports.tsx`

**Acceptance**：
- ✅ 能录一笔 dealer 付款，dealer 端 deposit_balance 反映
- ✅ Order delivered 后能 issue invoice
- ✅ AR aging report 显示 30/60/90 day 桶

---

### Phase 6 · Supplier（Week 8）

**前置阅读**：
- `proto/supplier*.jsx`（4 个文件）
- `proto/supplier-mobile.jsx`

**任务**：

A. **API routes**：
- `purchase-orders.ts` 扩展：supplier 视角 list（filter own supplier_id）、acknowledge、update_sup_status
- `supplier-products.ts`：supplier 自管 SKU

B. **Web pages**：
- `SupplierApp.tsx`
- `SupplierDashboard.tsx`
- `SupplierPOs.tsx`：PO 列表 + 详情
- `SupplierProducts.tsx`
- `SupplierActions.tsx`：acknowledge、update status

**Acceptance**：
- ✅ Supplier 账号能看到 logistics 创建的 PO
- ✅ Supplier 能 acknowledge PO，状态 pending → acknowledged
- ✅ Supplier 能更新 sup_status（in_production → shipped → delivered）

---

### Phase 7 · Partner / 3PL（Week 9）

**前置阅读**：
- `proto/partner*.jsx`（4 个文件）

**任务**：

A. **API routes**：
- `partner-orders.ts`：assigned to me、accept、update_stage、upload_pod
- `partner-fleet.ts`：CRUD trucks
- `storage.ts`：sign upload URL（用 service_role 给 Supabase Storage 签 URL）

B. **Web pages**：
- `PartnerApp.tsx`
- `PartnerDashboard.tsx`
- `PartnerPickups.tsx`
- `PartnerActions.tsx`：accept assignment、update stage、upload POD photo

**Acceptance**：
- ✅ Phase 4 logistics 出库后 partner 能看到 assignment
- ✅ Partner 能 upload POD 照片到 Supabase Storage
- ✅ Mark delivered 后 order 状态正确流转

---

### Phase 8 · Showroom + BD（Week 10）

**前置阅读**：
- `proto/showroom*.jsx`、`proto/bd*.jsx`

**任务**：
- Showroom：客户面对面浏览模式 + 简化下单流程
- BD：dealer onboarding pipeline、inquiry funnel、conversion tracking

**Acceptance**：
- ✅ Showroom mode 公开 URL 能浏览 catalog
- ✅ BD 能录入 inquiry、跟进 stage
- ✅ Inquiry converted 后能触发 new_dealer approval

---

### Phase 9 · Go-Live（Week 11）

**目标**：新系统上 production，旧系统退役。**因为旧系统全是 testimony data，不需要任何数据迁移**——直接 deploy + 切换 + 把旧的关掉就行。

**任务**：

1. **最终 QA pass**（Day 1-2）
   - 跑全套 E2E test：dealer 完整下单 → logistics 出库 → partner 送达 → finance 收款 → invoice
   - 9 个 role 全部 manual smoke test
   - Mobile 视口测试（dealer + supplier + partner 三个最重要）

2. **Production 环境配置**（Day 2）
   - Cloudflare Pages：apps/web 绑生产域名
   - Cloudflare Workers：apps/api 绑生产 route + secrets
   - Supabase：把 `carres-portal-v2` project 切到生产模式（Pro tier 必须）
   - DNS 指向新系统

3. **创建生产用户**（Day 3）
   - 用 principal 账号通过 `PrincipalAccounts` 页创建实际用户
   - 各 role 至少 1 个 alpha 用户拿账号
   - 确认每人能登入 + 看到对的页面

4. **Go-live**（Day 3-4）
   - 公布新 URL 给 alpha 用户
   - 24 小时 standby 监控（error rate / latency / business metrics）
   - 准备 rollback 方案：DNS 30 秒可切回旧域名（虽然不会用到）

5. **旧系统退役**（Day 5+）
   - 旧 Carres-Portal repo 改成 archived 状态
   - 旧 Supabase project 备份后归档（保留 2 周后正式删除，节省费用）
   - 旧的 Cloudflare Pages / Workers deployment 删除

**Acceptance**：
- ✅ 9 个 role 全部 alpha 用户在生产能正常用
- ✅ 一笔真实订单能跑完完整 lifecycle（place → delivered → invoiced）
- ✅ 监控 dashboard 24 小时无 critical error
- ✅ 旧系统已 archive，资源已回收

**风险 ⚠️**：
- Cloudflare Workers 冷启动延迟可能影响 first-load 体验。Phase 1 baseline 测过应该没问题，Go-live 当天再观察一次。
- DNS TTL 设短点（300 秒），万一要切回旧的快速。

---

## 9. 安全 & RLS 性能策略

> 你 HV Portal 现在的 lag 问题（130 policies + dashboard_summary RPC 慢），这次开新仓就一开始预防。

### 9.1 Trust Boundaries 强化

| 操作 | 用 user JWT | 用 service_role |
|---|---|---|
| 普通 CRUD（dealer 看自己的 order）| ✅ | ❌ |
| 跨 role admin（principal 创建用户）| ❌ | ✅ |
| Webhook 处理（payment gateway 回调）| ❌ | ✅ |
| Cron job | ❌ | ✅ |
| 文件上传签 URL | ❌ | ✅ |

**铁律**：service_role key **只在 Hono Worker env 里**。Wrangler secrets 设。**永远不要**进 git，不要进 web bundle。

### 9.2 RLS 性能 3 招

#### 招 1：高频 helper 用 JWT claim 直读，不查表

zip 的 `auth.app_role()` 每次 policy check 都 `select role from app_users where id = auth.uid()`。9 roles × 25 tables × N rows = 性能黑洞。

改进：登录时把 role 写进 JWT custom claim：

```sql
-- Supabase Auth Hook (Custom Access Token Hook)
create or replace function auth.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql as $$
declare
  v_user_meta jsonb;
  v_role text;
  v_dealer_id text;
  v_supplier_id text;
  v_partner_id text;
begin
  select 
    role::text,
    dealer_id::text,
    supplier_id::text,
    partner_id::text
  into v_role, v_dealer_id, v_supplier_id, v_partner_id
  from public.app_users
  where id = (event->>'user_id')::uuid;
  
  v_user_meta := jsonb_build_object(
    'role', v_role,
    'dealer_id', v_dealer_id,
    'supplier_id', v_supplier_id,
    'partner_id', v_partner_id
  );
  
  return jsonb_set(
    event, 
    '{claims, app_metadata}', 
    v_user_meta
  );
end;
$$;
```

然后 policy 改用 `(auth.jwt() -> 'app_metadata' ->> 'role')` 直读，零 query。

#### 招 2：所有 policy 包 `( select auth.uid() )`

PostgreSQL 14+ 的 query planner 会把 `( select auth.uid() )` 当 InitPlan 只算一次；不包则每行重算。

```sql
-- 慢
create policy "dealer_orders_self" on orders
  for select using (dealer_id = auth.app_dealer_id());

-- 快
create policy "dealer_orders_self" on orders
  for select using (dealer_id = ( select auth.app_dealer_id() ));
```

Phase 1 应该 pass 1 整理 0002_rls.sql 全部按这个 pattern 改。

#### 招 3：所有 helper function 加 STABLE

```sql
create or replace function auth.app_dealer_id()
returns uuid
language sql stable security definer as $$  -- 注意 stable 关键字
  select dealer_id from public.app_users where id = auth.uid()
$$;
```

`STABLE` 让 planner 知道函数同一 query 内多次调用结果一致，可以 cache。

### 9.3 Phase 1 末尾 baseline 测试

灌 10K orders 假数据，跑这几个 query 看时间：
- dealer 看自己 50 个 active order：< 100ms
- principal 看 dashboard summary：< 500ms
- logistics 看 4 列 kanban：< 200ms

如果超标，立刻在 Phase 1 内修，不要往后拖。

---

## 10. Go-Live 部署流程

> 因为旧系统无真实数据，整个 cutover 简化成单纯的「部署 + 切换 + 退役」。

### 10.1 关键决策

| 决策 | 答案 |
|---|---|
| 数据迁移 | **不需要**（旧系统全是 testimony data）|
| 旧系统处理 | **直接 archive + 资源回收** |
| 域名策略 | 新系统直接接管原本的生产域名 |
| Rollback 方案 | DNS 30 秒可回切（理论上用不到，但保留 2 周）|
| 旧 Supabase project | 备份后保留 2 周，确认无回头需要后删除 |

### 10.2 Go-Live Checklist

```
☐ Phase 8 全部完成 + /review + /design-review 都通过
☐ E2E test 全绿
☐ 9 个 role manual smoke test 完成
☐ Cloudflare Pages 生产环境配置完成
☐ Cloudflare Workers 生产环境 secrets 配置完成
☐ Supabase 生产 project 升 Pro tier
☐ Production 用户账号通过 PrincipalAccounts 页创建
☐ 各 role alpha 用户能正常登入
☐ DNS TTL 设短（300 秒）
☐ 监控 dashboard 设好（Cloudflare Analytics + Supabase Metrics）
☐ Rollback 方案文档化（DNS 切回旧域名的步骤）
☐ 切换 DNS → 新系统接管
☐ 24h standby 监控
☐ 旧 Carres-Portal repo 改 archived
☐ 旧 Cloudflare deployment 删除
☐ 旧 Supabase project 备份保留 2 周
```

---

## 11. Review、Test、Ship 流程

> 每个 phase 都按这套走。

### 11.1 Per-phase 流程

```
1. Phase plan 写出来 → /plan-eng-review skill 审
        ↓
2. Claude Code 实现（按 Phase 任务清单）
        ↓
3. 自测：本地跑通所有 acceptance criteria
        ↓
4. /review skill：审 backend（N+1、race、trust boundary、RLS）
        ↓
5. /design-review skill：审 frontend（视觉是否 match zip prototype）
        ↓
6. Loo 手动验收（重点 phase 自己点一遍）
        ↓
7. Merge + deploy 到 staging
        ↓
8. Smoke test on staging
        ↓
9. Promote to production
        ↓
10. 写 phase reflection（学到什么 → 下个 phase 调整）
```

### 11.2 Test 策略

| Test type | 工具 | 用在哪 |
|---|---|---|
| Unit | vitest | adapters、zod schemas、utils |
| Integration | vitest + msw | API routes（mock Supabase）|
| E2E | Playwright | 关键 user flow（Phase 2 之后开始）|
| Manual smoke | 人 | 每次 ship 前 |

E2E 必跑的关键 flow（Phase 9 Go-live 前必须全绿）：
- Dealer 完整下单 → logistics 出库 → partner 送达 → finance 收款
- Top-up approval workflow（dealer → principal → finance）
- Supplier 收 PO → ack → ship → logistics 收货
- Refund workflow

---

## 12. 红线与风险

### 12.1 不可碰红线（继承 global CLAUDE.md）

1. **永不** DROP / TRUNCATE / DELETE without explicit single-instance confirmation in current conversation
2. **永不** 修改 Supabase RLS without explanation
3. **永不** 写 secret 进 code，全部走 .env / Wrangler secrets
4. **永不** `git push --force` / `reset --hard` / `rm -rf` 已 track 目录
5. **永不** 删除未要求删除的文件
6. **永不** 修改已 commit 的 migration 历史
7. **"User said OK before"** 不算同意——必须当前 conversation 显式确认

### 12.2 项目级风险登记

| 风险 | 影响 | 概率 | 缓解 |
|---|---|---|---|
| RLS policies 性能爆炸（130+ policies）| dashboard 慢 | 高 | Phase 1 用 JWT claim + STABLE + InitPlan 包装 |
| service_role key 泄露 | DB 全裸 | 低（如有则灾难）| Phase 1 grep audit + Wrangler secrets only |
| Cloudflare Workers 冷启动 | first-load 慢 | 低 | Phase 1 baseline 测；Workers Paid tier $5/月 cold start 显著好 |
| Claude Code 改坏旧 production | 上线系统挂 | 低 | 新 repo 完全隔离，旧 repo 物理上 Claude Code 不开 |
| 9 roles 工作量超出 11 周 | 时间表延后 | 中 | 每周末检查进度，必要时 phase 8 砍一半到下次 release |
| Go-live 当天发现 critical bug | 用户用不了 | 低 | DNS 30s 回退 + 旧系统保留 2 周作备援 |

### 12.3 Open Questions（实施前再确认）

1. 新系统直接接管原本的生产域名，还是先用一个新域名跑 1 周再切？
2. Cron job 调度时区：MYT (Asia/Kuala_Lumpur)？
3. Supabase Pro tier（$25/月）还是更高？取决于预期 MAU 跟 storage 用量。

---

## 13. 附录：文件 Reference Map

### 13.1 zip 包内文件按 phase 分类

| Phase | 重点参考文件 |
|---|---|
| Phase 0 | `production/package.json`、`production/vite.config.ts`、`production/tailwind.config.ts`、`shared/styles.css` |
| Phase 1 | `production/supabase/migrations/000{1,2,3}.sql`、`production/src/lib/{supabase,auth,roles,db-types,domain,adapters}.ts`、`production/src/pages/Login.tsx` |
| Phase 2 | `proto/dealer*.jsx`、`proto/new-order*.jsx`、`proto/showroom.jsx`、`production/src/pages/dealer/*` |
| Phase 3 | `proto/principal*.jsx`、`production/src/pages/principal/*` |
| Phase 4 | `proto/logistics*.jsx`、`production/src/pages/logistics/*` |
| Phase 5 | `proto/finance*.jsx` |
| Phase 6 | `proto/supplier*.jsx` |
| Phase 7 | `proto/partner*.jsx` |
| Phase 8 | `proto/showroom*.jsx`、`proto/bd*.jsx` |
| Phase 9 | （deploy + smoke test，无前端文件参考）|

### 13.2 关键 Spec 文档

| 文件 | 内容 |
|---|---|
| `MIGRATION_SPEC.md` | §1 roles、§2 page inventory、§3 schema、§4 RLS、§5 API、§6 workflows、§7 storage、§8 auth |
| `HANDOFF.md` | zip 作者留给 Claude Code 的 context |
| `CLAUDE.md`（zip 内）| zip prototype 的编辑约定（**仅适用于 zip prototype 本身**，新 repo 不要继承）|
| `README.md`（zip 内）| zip 的高层介绍 |

### 13.3 新仓应该写的文档

| 文件 | 时机 |
|---|---|
| `CLAUDE.md`（项目级）| Phase 0 写好，含项目特定 rules |
| `README.md` | Phase 0 写好基础，每个 phase 增量更新 |
| `docs/architecture.md` | Phase 0-1 期间写 |
| `docs/runbook.md` | Phase 9 之前写好（go-live 应急 playbook）|
| 每个 phase 的 `phase-{N}-reflection.md` | Phase 结束写 |

---

## 收尾

**这份文档是活的**。每个 phase 结束后回来更新：
- 实际花了多久（vs 估计）
- 踩了什么坑
- Schema 有没有微调
- 下一 phase 要带的注意事项

把它跟新仓 `CARRES_PORTAL_V2_PLAN.md` 同步，commit 进 repo。

> **Loo 的 stake**：成功 = 9 roles 全部上线 + 性能不输旧系统 + 准时 Go-live。
> **Claude Code 的 stake**：每个 phase acceptance 全过 + 不踩红线 + 文档同步更新。

—— 完 ——
