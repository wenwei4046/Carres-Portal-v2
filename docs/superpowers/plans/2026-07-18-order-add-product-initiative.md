# Order Add-Product Initiative — design (2026-07-18)

> **Requirement (Loo, 2026-07-18):** 开完单后，在 **placed** 状态还能加产品；
> 进到 **proceed** 后不能直接加 —— 除非走 **submission**（提交变更），由
> operation 审批通过才生效。范围 = **任何产品（含沙发 build / 床垫）**。
> 只做 **ADD**；改行 / 删行不在本次范围（表结构预留 kind 扩展）。

---

## 1. 为什么这是一个 initiative，不是一个 fix

Carres 至今的设计契约是 **`order_lines` 只在建单时写入，之后只读**
（`docs/superpowers/plans/2026-07-14-pos-order-detail.md` §7 白纸黑字:
"Carres has ZERO order_lines write path — create_order-only by contract"）。
所有订单智能 —— 0089 品类互斥、沙发 recompute + explode（P4/P5）、PWP（P8）、
free gifts（P7）、special add-ons（P3）、delivery fee（P6）—— 全部只在
**Hono create route** 跑一次。给已存在的订单加一行，等于把这条智能管线
第二次接上一张已经活着的订单。这就是当初把 line-edit 划出范围的原因，
也是本设计的核心工程量。

## 2. 总原则：ONE apply path, TWO entry gates

```
placed 订单:  POS "+ Add product" ────────────────┐
                                                   ├─→ POST /api/orders/:id/lines
proceed 订单: POS "Submit change" → order_change_  │    (Hono: 全量重验管线)
              requests (pending) → ops APPROVE ────┘         ↓
                                                   RPC add_order_lines (仅追加,
                                                   create_order 原封不动)
```

- **一条 apply 管线**：不管直接加还是审批后加，最终都走同一个 Hono
  endpoint + 同一个新 RPC。审批只是「谁按下 apply」的门，不是第二套逻辑。
- **create_order / 既有 order_lines / DraftLine / cart.ts 不动**（P4-P8 惯例）。

## 3. 服务端设计

### 3.1 新 RPC `add_order_lines`（migration 0231）
- `add_order_lines(p_order_id uuid, p_lines jsonb, p_source text, p_change_request_id uuid default null)`
- SECURITY DEFINER；status 门：`place`（direct）或 `proceed_order`+有已批准
  change request（`p_change_request_id` 必填且 status='approved' 未 applied）；
  delivered/cancelled 永远拒。
- 只 INSERT 新 `order_lines` 行 + order_history（metadata: lines + total delta）
  + audit_log；不碰旧行。
- AutoCount 单：加行时翻 `orders.items_edited = true`（0135 基建首次真正使用，
  防 re-import 冲掉 portal 加的行）。

### 3.2 Hono `POST /api/orders/:id/lines` — 智能管线复用
按 create route 同序重跑，但作用于 (existing lines + new lines) 的合并购物车：

| 检查/重算 | 复用 | 处理方式 |
|---|---|---|
| 0089 品类互斥 | create 的 mutex 查询 | 新行与**既有行**合并后判 sofa × mattress/bedframe |
| 价格权威 | catalog 服务端价 | 新行单价一律服务端定（client 报价仅供预览） |
| 沙发 build | `recomputeAndExplodeSofaBuildLines` | 新 build 行照常 drift-gate + explode 成 per-compartment 行 |
| Special add-ons | P3 recompute | 只对新行验 |
| Free gifts (P7) | `free-gift-resolve` | 合并购物车重算应得 gift 集，**diff 出新增 gift 行**一并追加（已有 gift 行不动/不收回） |
| PWP (P8) | `resolvePwp` | v1 仅验新行的 claim 合法性；不回溯重算旧行 |
| Delivery fee (P6) | `computeDeliveryFee` | 合并购物车重算 → **replace** 服务端专属的 DELIVERY* `order_addons` 行（server-exclusive keys，可安全替换） |

失败 = 整体 422 拒绝（fail-closed），订单字节不变。

### 3.3 Submission 表（migration 0231）`order_change_requests`
```
id uuid PK · order_id FK orders · kind text check ('add_lines')   -- 预留扩展
payload jsonb        -- DraftLine[]（提交时的行 + 预览价）
status text check ('pending','approved','rejected','cancelled')
requested_by uuid / requested_at · decided_by uuid / decided_at · decision_note
applied_at timestamptz  -- approve 后 apply 成功的印章（幂等防重放）
```
- RLS：dealer 读/建/撤自己 dealer 的；internal 全读；**审批只经 RPC**
  `decide_order_change_request`（operation/principal），approve 后由 Hono
  `POST /api/operation/change-requests/:id/decide` 走 §3.2 同一管线 apply。
- 每单同时只允许一张 pending（partial unique index），防提交轰炸。

### 3.4 付款连带
加行抬高 total → paid% 回落。规则：**不回收已 proceed 状态**（订单不自动
退回 placed）；新 outstanding 自然流入 Balance/收款面板（0230 的手动收款 +
Stripe collect 已就绪）。placed 单加行后若 <50%，proceed 门本来就会拦住。

## 4. Web 设计

| 面 | 内容 |
|---|---|
| `PosOrderDetail` placed lane | Items 卡尾部 "+ Add product" → 全屏复用 POS 目录选择器（CatalogStep 网格 + ConfigureDrawer / PosConfigurePage / SofaConfigurePage 喂一个 mini-draft）→ 确认后打 `POST /:id/lines` → refetch |
| `PosOrderDetail` proceed lane | 同一按钮变 "Submit product change"，走 change request；Items 卡显示 pending 徽章（行 + 价 + 状态），pending 期间可 Cancel |
| Operation `OrderDetailDrawer` | 新 "Change requests" 面板：pending 列表 → 行预览 + total delta → Approve / Reject（必填 note on reject） |
| `order-edit-scope.ts` | 新增 `canAddProduct`（=editablePlaced）与 `canSubmitLineChange`（=editableProceed）+ 测试矩阵扩展 |

## 5. 分期（每期 design-first + adversarial review，P8 纪律）

| Phase | 内容 | 大小 |
|---|---|---|
| **P1** | migration 0231（RPC + 表）+ shared zod + `POST /:id/lines`（mutex + 服务端价 + special addons；**不含 sofa-build/gift/PWP/delivery 重算**）+ placed-lane UI（flat 产品全品类） | ~1 session |
| **P2** | 智能管线全量接入：sofa-build add（drift+explode）+ free-gift diff 追加 + PWP claim 验证 + DELIVERY* addon replace | ~1-2 session（最重） |
| **P3** | proceed-lane submission + ops 审批面板 + items_edited 翻牌 + E2E | ~1 session |

P1 上线即有业务价值（截图场景 Memory Foam Pillow 补加就是 P1 覆盖面）；
P2 前 sofa-build 在 add 流程里禁用（409，POS 藏入口）—— 与 P7
`free-item-sofa-build-disallowed` 同款渐进模式。

## 6. 默认拍板（Loo 可否决）

1. **审批人 = operation + principal**（finance/bd 只读）。
2. **价格权威 = 服务端 catalog 价**，ops 审批时不能改价（要改价 = 另一个
   initiative；v1 防越权定价）。
3. **只 ADD**。remove/edit 走 kind 扩展，另立 phase。
4. proceed 单被批准加行后 **不退回 placed**、不重开 proceed 检查；付款差额
   由 Balance 流程追。

## 7. 风险（⚠️ 提醒，不挡路）

- **P2 是真雷区**：gift/PWP/delivery 的「合并购物车重算 + diff 应用」在
  create 语境外从未跑过 —— 必须逐引擎 adversarial review（P6-P8 全部惯例）。
- 加行发生在 ops 已排产之后（approved change on proceed）会打乱 PO/stock
  预留 —— 新行按正常 placed 行进入 threads/PO 管线（per-line thread 自动
  split 已有），ops 在 Items ordered 表会看到新行为 shortage，属预期。
- 审批门是**防呆不防恶**（dealer JWT 走 RLS，不能自批 —— decide RPC 角色门
  在 DB 层锁 operation/principal）。
