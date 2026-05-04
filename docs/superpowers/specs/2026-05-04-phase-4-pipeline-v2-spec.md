# Phase 4 — Pipeline Status v2 Spec

**Status**: Draft, pending Loo's approval (created 2026-05-04, GMT+8)
**Author**: Claude (Opus 4.7) with Loo input
**Supersedes**: relevant sections of `docs/superpowers/specs/2026-05-03-phase-4-logistics-design.md`

---

## 1. 背景

Loo 在 2026-05-04 dogfood logistics module 时提出当前 pipeline 链有 3 个根本问题：

1. **Logistics 看不到 dealer placed 但还没 push 的 order** — Loo 想让 logistics 也能看到这一栏（read-only），称作 "Awaiting Request to Proceed Order"。
2. **现有 `awaiting_stock` 同时承担两种含义**：(a) "logistics 还没决定要不要订货"；(b) "已发 PO 等到货" — 语义重叠。Loo 建议拆成新加 `proceed_request` 阶段。
3. **转去 `ready_to_dispatch` 应触发 SKU auto-reserve**，确保库存不会被另一笔 order 抢走。Loo 描述："凡是進入 Ready to Dispatch 的訂單，一定要確保 Stock 是充足的 ... once order is transfer to ready to dispatch, it will auto reserve the sku item in warehouse quantity."

---

## 2. 当前状态（实现验证）

### 2.1 Schema

`supabase/migrations/0001_init.sql:27`：

```sql
create type logistics_stage as enum
  ('awaiting_stock','ready_to_dispatch','dispatched','delivered');
```

`supabase/migrations/0018_stock_balances_reserved.sql`：

```sql
alter table stock_balances add column reserved int not null default 0;
-- constraints: reserved >= 0  AND  qty >= reserved
```

`available = qty - reserved` 是动态计算（不物化）。

### 2.2 现有 stage transition 路径（`0019_logistics_rpcs.sql`）

```
status='place'            (dealer 视角 — logistics 当前看不到)
   ↓ proceed_order RPC（0008）→ status='proceed_order'
   ↓ logistics_ingest_proceed RPC（0019:161-340）
   ↓   ├─ 库存够 → logistics_stage='ready_to_dispatch'  (line 305)
   ↓   └─ 缺货 → logistics_stage='awaiting_stock'        (line 319)
   ↓
   ↓ logistics_receive_po_line（fully received）→ logistics_stage='ready_to_dispatch' (line 779)
   ↓ 或：手动 mark stock arrived → logistics_stage='ready_to_dispatch' (line 1182)
   ↓
   ↓ logistics_assign_partner + dispatch → logistics_stage='dispatched' (line 876)
   ↓
   ↓ logistics_attach_do → status='delivered' + logistics_stage='delivered' (line 961)
```

### 2.3 Reserve 当前行为

`stock_balances.reserved` 列**已存在**，但**目前未被任何 RPC 主动写入**。属于 Phase 4 M1 设计里预留的并发安全字段，等 v2 这次启用。

`OrderDetailDrawer.tsx:311` 已经在读 `bal.reserved` 计算 available，但因为没人写入，永远是 0。

### 2.4 Dealer 视角

Dealer Dashboard / Orders 页只读 `order.status`（`'place' | 'proceed_order' | 'delivered' | 'cancelled'`），**完全不读 `logistics_stage`**。所以 logistics_stage 加新值不影响 dealer 端。

---

## 3. 新设计

### 3.1 Logistics 视角：6 stages

| Stage | 含义 | 进入条件 | 离开条件 |
|---|---|---|---|
| `placed` | Dealer 已 create，未 push | dealer 创 order（auto） | dealer click "Proceed" |
| `proceed_request` | Dealer 已 push，logistics 待 triage | dealer click "Proceed" | logistics 决定（issue PO 或直接 transfer） |
| `awaiting_stock` | Logistics 已 issue PO，等到货 | logistics 操作（issue PO / RPC 自动） | PO 全收 OR logistics 手动 mark stock 已到 |
| `ready_to_dispatch` | 库存就位，已 reserve | (a) PO 全收 OR (b) 直接 transfer（库存够） | logistics assign partner + dispatch |
| `dispatched` | Partner 在送 | partner assign + dispatch click | DO upload |
| `delivered` | 已送达 | DO upload | (终态) |

### 3.2 Dealer 视角：3 简化 tabs（不动）

| Dealer Tab | 字段 mapping |
|---|---|
| Placed | `status='place'` |
| Proceed Delivery Status | `status='proceed_order'`（涵盖 4 个 logistics stages: proceed_request, awaiting_stock, ready_to_dispatch, dispatched）|
| Delivered | `status='delivered'` |

**关键约束**：`order.status` 字段不动 — 仍是 `place / proceed_order / delivered / cancelled` 4 态。新增 stages 只在 `logistics_stage` enum 里。**Dealer 端 0 改动**。

### 3.3 Auto-reserve 行为

| Transition | Reserve 操作 | 实际 qty 操作 |
|---|---|---|
| → `ready_to_dispatch` | `reserved += line.qty`（per SKU per source warehouse） | 不动 |
| `dispatched` → `delivered`（DO upload） | `reserved -= line.qty` | `qty -= line.qty`（写 movement log） |
| Order cancelled / abandoned（任何阶段 ≥ ready_to_dispatch）| `reserved -= line.qty` | 不动 |

`stock_balances.qty >= reserved` 这个 CHECK 保证 reserve 不会越界 — 如果库存不够 reserve 就 fail，logistics UI 接住报错。

---

## 4. Schema 改动（migration `0023`）

### 4.1 新增 enum 值

PG `ALTER TYPE ... ADD VALUE` 必须在独立 transaction 跑（不能 wrap 在 BEGIN/COMMIT 里）。两种做法：

- **方案 A（推荐）**：拆 2 个 migration 文件
  - `0023_logistics_stage_enum_extend.sql`：只 ADD VALUE
  - `0024_logistics_stage_v2_rpcs.sql`：用新 enum 值的 RPC 改动 + backfill
- **方案 B**：单文件，新 RPC 用 text comparison 而非 enum literal 直到下一个 migration

我倾向 A，简洁明了。

```sql
-- 0023_logistics_stage_enum_extend.sql
ALTER TYPE logistics_stage ADD VALUE IF NOT EXISTS 'placed' BEFORE 'awaiting_stock';
ALTER TYPE logistics_stage ADD VALUE IF NOT EXISTS 'proceed_request' BEFORE 'awaiting_stock';
```

### 4.2 Backfill（在 0024 内）

```sql
-- A. status='place' orders → logistics_stage='placed'
UPDATE orders
   SET logistics_stage = 'placed'
 WHERE status = 'place'
   AND logistics_stage IS NULL;

-- B. status='proceed_order' + 'awaiting_stock' but no PO ever issued for the
--    order → really 'proceed_request'（更准确）
UPDATE orders o
   SET logistics_stage = 'proceed_request'
 WHERE o.status = 'proceed_order'
   AND o.logistics_stage = 'awaiting_stock'
   AND NOT EXISTS (
     SELECT 1 FROM purchase_orders p
      WHERE o.dl = ANY (p.dl_refs)
   );

-- C. Backfill reserved for orders currently in ready_to_dispatch / dispatched
--    （它们的库存其实已经被消耗 / 占用，只是 reserved 列从未被写入）
WITH affected AS (
  SELECT o.id, o.warehouse_id, ol.sku, sum(ol.qty) AS qty
    FROM orders o
    JOIN order_lines ol ON ol.order_id = o.id
   WHERE o.status = 'proceed_order'
     AND o.logistics_stage IN ('ready_to_dispatch','dispatched')
   GROUP BY o.id, o.warehouse_id, ol.sku
)
UPDATE stock_balances sb
   SET reserved = sb.reserved + a.qty
  FROM affected a
 WHERE sb.warehouse_id = a.warehouse_id
   AND sb.sku = a.sku;
```

⚠️ 注意 C 的 backfill 必须满足 `qty >= reserved`，如果某 SKU 的 qty 已经 < 现有 in-flight orders（数据脏），backfill 会 CHECK 失败。要先 dry-run。

### 4.3 RLS

Logistics SELECT 范围当前应该已经覆盖 `status='place'` orders（因为 logistics 是 internal role，可读所有 orders）。需 verify — 如有 filter 限定 `status IN ('proceed_order', 'delivered')` 之类，要扩展。

**Dealer SELECT** 不动（dealer 只看自己的 orders，stage 不限定）。

---

## 5. RPC 改动

| RPC | 现状 | 新行为 |
|---|---|---|
| `proceed_order(order_id)` | `status='proceed_order'`，不写 logistics_stage（依赖 ingest 后续设置）| 加一行：`logistics_stage='proceed_request'` |
| `logistics_ingest_proceed(order_id)` | proceed_request → awaiting_stock 或 ready_to_dispatch（看库存）| **删除自动 ingest**（移到 logistics 手动）— **OR** 重新定义为 confirm 入口 |
| `logistics_confirm_proceed_request(order_id)` | （新）| 触发现有 ingest 决策逻辑：库存够 → ready_to_dispatch + auto-reserve；不够 → awaiting_stock（等下一步 issue PO）|
| `logistics_issue_pos_for_order(order_id)` | proceed_request → awaiting_stock（隐式）| 显式：proceed_request | awaiting_stock 都允许 issue（对应 Loo "人工半自动系统发送 PO"）|
| `logistics_receive_po_line` 全收触发 | awaiting_stock → ready_to_dispatch | 加 auto-reserve 副作用 |
| `logistics_transfer_to_ready_to_dispatch` | （现有 line 1182）awaiting_stock → ready_to_dispatch | 加 auto-reserve 副作用；同时新增允许 `proceed_request → ready_to_dispatch` 跳过 awaiting |
| `logistics_attach_do` (delivered transition) | logistics_stage='delivered'，写 movement log out | 加 release reserve 副作用（reserved -= qty）|
| `logistics_abandon_order` / `cancel_order` | 终止 order | 加 release reserve（如果当前 stage ≥ ready_to_dispatch） |

### 5.1 Auto-reserve 实现选项

**选项 1：在每个 transition RPC 内 inline 写 reserve**
- 改动多个 RPC，一致性靠 review
- 简单、直白

**选项 2：用 PG trigger 在 logistics_stage 变化时自动 reserve / release**
- 逻辑集中，但 trigger 较 magical，新人 onboard 不易看出
- PG trigger AFTER UPDATE OF logistics_stage 可以做

**推荐**：选项 1。Logistics_stage transition 已经全在 RPC 内显式写出，加一行 reserve UPDATE 就好，不引入 trigger 心智负担。

---

## 6. API 改动

| Route | 改动 |
|---|---|
| `GET /api/logistics/orders` | filter 加默认包含 `status='place'`；`logistics_stage` filter 加新值 |
| `GET /api/logistics/dashboard` | counts 加 `placed`, `proceed_request` 两栏 |
| `POST /api/logistics/orders/:id/confirm-proceed` | 新 endpoint，调 `logistics_confirm_proceed_request` RPC |
| `POST /api/logistics/orders/:id/transfer-ready` | 新 endpoint（现有 transfer RPC 已经在，包一层 route） |
| `GET /api/logistics/warehouse` | 加 reserved 列（其实已返回，但前端没显示） |

---

## 7. 前端改动

### 7.1 LogisticsOrders Pipeline (kanban)

- 4 栏 → 6 栏（grid-cols-4 → grid-cols-6）
- 每 stage 的 ActionBar 重写，新加 Placed (read-only), Proceed Request (Confirm/Transfer/Issue PO 按钮)
- 跟 issue F (column 展开 motion) 一起做合理 — 6 栏太窄，必须能 expand

### 7.2 LogisticsDashboard

- Pipeline column 从 3 → 5（Placed / Proceed Request / Awaiting / Ready / Dispatched，Delivered 不上 pulse），或保留 3 主要的，新加 KPI 单独 tile
- KPI strap 加 "X awaiting your decision" 引导 logistics 触发 confirm

### 7.3 Warehouse Reserve Tab（issue G）

- 新 tab "Reserve"：每 SKU 分两栏 "On hand qty" / "Reserved qty" / "Available (qty - reserved)"
- 点 reserved 数字可看是哪些 orders（drill-down）
- 跟 C 强耦合（数据来源同一列）

### 7.4 Dealer 端

- 不动。再次强调：dealer 不读 `logistics_stage`，新增 stages 完全 transparent。

---

## 8. Open Questions（要 Loo 决定）

每条建议默认值已写出，Loo 可一行 yes/no 或改写。

### Q1. Placed → Proceed Request 的 trigger
> Dealer click "Proceed" 直接把 stage 设到 `proceed_request`？还是 logistics 手动 confirm 才转？

**建议**：dealer click 后 RPC 直接设 `proceed_request`，logistics 看到后再 triage。

### Q2. Logistics 在 Placed 状态可做什么？
> 看（read-only）够吗？还是要做 action？

**建议**：read-only。仅展示 awareness。

### Q3. Awaiting Stock → Ready 的转换 trigger
> PO 全收完自动 transition？还是 logistics 手动 mark "all stock arrived"？

**建议**：自动 transition（PO 全收 → ready_to_dispatch + auto-reserve），同时**保留**手动 transfer button（库存原本就够、不发 PO 的情况）。

### Q4. Reserve 释放规则
> Order delivered 时一次过 release reserve + decrement qty？还是 partner pickup 时 release，DO 上传时 decrement？

**建议**：simplify — DO 上传时一次过 release reserve + decrement qty，写 single movement log row。

### Q5. Cancel/Abandon order 的 reserve 处理
> 立即 release？

**建议**：是。所有终止路径都 release reserve（abandon, cancel）。

### Q6. Partner sub-stage（pickup 进度）
> 当前 `dispatched` 是单一 stage。proto 里有 `partner_stage` (pending_pickup / picked_up / arrived)。要不要利用？

**建议**：暂留 `dispatched` 单一 stage，partner_stage 留 sub-state，不进 kanban 列。改动最小。

### Q7. Performance — Placed 栏 paginate
> 测试 data 有 1000+ `status='place'` orders。Logistics 视角要全部 load？

**建议**：是，paginate（default 50 newest）+ "View all placed →" 跳详情页。

### Q8. Backfill 风险 — 现有 ready_to_dispatch / dispatched orders 的 reserved 补值
> 第 4.2 §C backfill 可能 fail（如果某 SKU qty < in-flight orders 累计）。要怎么处理？

**建议**：先 dry-run（只 SELECT 不 UPDATE），列出脏数据，让 Loo 决定是否 truncate 这些异常 orders 或 manual fix。

### Q9. Reserve 不需要源 warehouse 限定？
> 一笔 order 假设 lock 库存到 `warehouse_id`。但 dealer 创单时不指定 warehouse — logistics 后来 assign。如果 transfer to ready_to_dispatch 时 logistics 仍未指定 warehouse 会怎样？

**建议**：transfer_to_ready 必须先 assign warehouse（已有 `logistics_reassign_po_warehouse` RPC，类似 pattern）。如果没 warehouse，RPC raise 错误。

---

## 9. 推荐执行 Phasing

如批准，建议拆 4 个独立 commit：

### C1: Schema enum extend + backfill（独立 migration）
- `0023_logistics_stage_enum_extend.sql` — ADD VALUE
- `0024_logistics_stage_v2_backfill.sql` — backfill placed / proceed_request / reserved
- 跑 dry-run 报告先给 Loo 看，再决定是否 apply
- ⚠️ Migration 跑后 Phase 4 已有 309 tests 跑一次 baseline，确认没 regress

### C2: RPC 改动 + auto-reserve hooks
- `0025_logistics_pipeline_v2_rpcs.sql`：改 8 个现有 RPC + 新增 1 个 (`logistics_confirm_proceed_request`)
- 新增 unit tests for auto-reserve invariants

### C3: API + 前端 6-column pipeline + dashboard counts
- 新增 2 个 routes (`confirm-proceed`, `transfer-ready`)
- `LogisticsOrders.tsx` grid-cols-4 → 6（含 issue F 的 column expand 动画）
- `LogisticsDashboard.tsx` counts 加新 stages

### C4: Warehouse Reserve tab（issue G）
- 新 tab UI
- API 已经返回 reserved 列，纯前端

如发生问题，C1/C2/C3/C4 任意一个可单独 revert 不影响其他。

---

## 10. Out of Scope（显式排除）

- **不动 dealer 端 UI**（status enum 不变，dealer order journey 不动）
- **不引入 partner_stage sub-stages**（保持单一 dispatched）
- **不动 finance / principal 视角**（只 inherit 新 enum 值，不专门 UI 改）
- **不动 8 个角色现有 RLS 政策**（仅 logistics SELECT 范围若需扩，单独 verify + PR）
- **不重构 movement log schema**（reserve 的写/读用现有 stock_movements 表）
- **不做 historical reservation tracking**（reserve 是个 counter，不存历史 — 历史进 movement log）

---

## 11. Risks & Open Engineering Questions

1. **Backfill 数据脏导致 CHECK 失败** — 见 Q8。先 dry-run。
2. **现有 309 tests 必然 regress**：
   - `useLogisticsOrders` filter 默认值改了 → list response shape 变 → fixtures 要改
   - `proceed_order` RPC unit tests 期待 logistics_stage IS NULL → 改成期待 'proceed_request'
   - 估计 30-50 个测试要 update
3. **测试数据量大（1000+ placed orders）** Logistics dashboard 性能 — 可能要加索引 `(logistics_stage, status)` partial
4. **Concurrency**：两个 logistics user 同时 transfer to ready 同一个 order → 第二个 RPC 会因为 stage 已变 raise 错。RPC 必须 SELECT FOR UPDATE 或 stage check + transition atomic（现有 RPC 已经这样写）

---

## 12. 验收标准（Loo 验）

C1 + C2 + C3 完工后，end-to-end 走通：

1. ✅ Dealer 创新 order → logistics Pipeline "Placed" 栏立即看到（不需 refresh）
2. ✅ Dealer click Proceed → 出现在 logistics "Proceed Request" 栏
3. ✅ Logistics click "Issue POs" 在 proceed_request 栏 → order 移到 "Awaiting Stock"
4. ✅ Logistics click "Transfer to Ready"（库存够时）→ order 跳过 awaiting_stock 直接到 "Ready to Dispatch"，**warehouse Reserve tab 看到该 SKU reserve += qty**
5. ✅ PO 全收 → order 自动从 awaiting_stock 跳到 ready_to_dispatch + auto-reserve
6. ✅ Logistics assign partner + dispatch → "Dispatched"
7. ✅ Logistics attach DO → "Delivered"，Reserve 清零，stock qty 实减，movement log 写 out 行
8. ✅ Dealer 端 3 tab 显示正确（Placed / Proceed Delivery / Delivered），不需任何 dealer 代码改
9. ✅ 309 tests 修完后全 green
10. ✅ Type check pass

C4 完工：
- ✅ Warehouse Reserve tab 显示每 SKU `qty / reserved / available` 三列
- ✅ Click reserved 数字 drill-down 看是哪几笔 orders 占用

---

## 13. 时间预估

| Phase | 估计 | 说明 |
|---|---|---|
| C1 (schema + backfill) | 2-3 hr | 含 dry-run + review |
| C2 (RPCs + auto-reserve) | 4-6 hr | 含 unit tests |
| C3 (API + frontend 6-col) | 6-8 hr | 含 issue F (column expand) + 5+ component 改 |
| C4 (Reserve tab) | 2-3 hr | 纯前端 |
| **Total** | **14-20 hr** | 不含 309 test fixtures fix（额外 4-6 hr）|

如果一气呵成顺利，1 个 working day 可走完 C1-C2-C3，C4 + tests fix 第二天搞定。

---

## 14. Loo 的下一步

请回应以下：

1. ✅ Spec 整体方向 OK 吗？
2. Q1-Q9 各题选项确认（可一次过 "1A 2A 3A ..." 简写）
3. 批准启动 C1 吗？还是先看 backfill 影响范围 dry-run 报告？

---

End of spec.
