# Order Detail Panel — v3 定案

> 2026-07-10 · Jess (COO) 锁定 · **只有规格，还没写 code**
> 前身：`feat/orders-drawer-redesign-batch3` 的规格（v2）。v3 = 拿真数据审过一遍之后的版本。

---

## 0. 一条规矩，管住整份文件

> **能写的留下来**（它是让数据长出来的入口）。
> **只能看、又没数据的，删掉**（不是变灰，是删掉）。

一个永远灰着的步骤条，不是「还没填」，是**骗人**。

---

## 1. 真数据 — 每一刀都砍在这上面

2026-07-10 扫 prod：**168 张 order · 427 条 order_line**。

| 栏位 | 有数据 | 判决 |
|---|---|---|
| `customer_name` / `phone` / `address` | 168 / 168 | 留 |
| `orders.delivery_date` | 167 / 168 | 留 |
| `order_lines.source_po`（PO 文字号） | 415 / 427 | 留 |
| `order_lines.qty` | 427 / 427 | 留 |
| `line_stock_status` | 99 / 168 单 | 留 |
| `line_etas`（每件 Stock ETA） | 92 单 · 166 个 line key | 留（可写） |
| `ops_order_control.balance` | 61 设了 · **> 0 只有 10** | 留 — 这才是 Outstanding |
| `payment_status` | 58 / 168 | 留 |
| `purchase_orders`（真 PO 表） | **0 行** | ❌ `PO placed` 绿灯是假的 |
| `paid_amount`（收了多少） | **0 行** | ❌ Collected 永远 0 |
| `order_lines.unit_price > 0` | **2 / 427** | ❌ Total 永远 0 |
| `logistic_eta` | **1 / 168** | ❌ 整条 DELIVER 线砍掉 |
| `delivery_stops`（多段送货） | **0 行** | ❌ Delivery 卡砍掉 |
| `line_received`（GRN） | **0 行** | ❌ Recv 栏砍掉（按钮留） |
| `line_locations` | **1 / 168** | ❌ Warehouse 栏砍掉 |
| `storage_from` | **0 行** | ❌ Storage 卡砍掉 |
| `extension_count > 0` | **0** | ❌ Rescheduled 贴纸砍掉 |
| SKU 对得上 `product_skus` | **2 / 427** | ❌ **Size 栏不存在** |

**425 / 427 条 line 的 sku 是 AutoCount 抄来的一整串生字**，例如
`HK5531/28"(2 Seater+L SHAPE)/COL:M2402-4 SAND`、`1013Jager/Fab3-Queen/PC151-01`。
型号、尺寸、颜色黏在同一串里 —— 拆不出 Size。
**「Model 名断行」的真原因是那串字有 45 个字，不是栏太窄。**

---

## 2. ✅ Money 卡 —— 检查过，没 bug（2026-07-11 更正）

**之前误报「漏追钱」，已撤回。** 实读 `OrderDetailDrawer.tsx:852-857`（batch 2, `245ac34`）：
```
keyedTotal  = form.draft.balance || form.control.balance   // ← fallback 到 ops_order_control.balance
orderTotal  = hasLineTotal ? grandTotal : keyedTotal        // hasLineTotal = grandTotal>0，167/168 单 = false
collected   = Σ order_payments ledger
Outstanding = orderTotal − collected                        // = 5794 − 0 = 5794 ✓
```
没有单价时**已经自动 fallback 到 `balance`**，SO-1095 会正确显示 RM 5,794。**卡是好的，不用改。**
教训：读 code 也要读到底再下结论，不能只看变数/label 名字（§ feedback verify-before-assert）。
- 保留的小规矩：给人看的字永远是 **Outstanding**，不是 Owing（DB 里 outstanding 87 次、owing 0 次）。

---

## 3. 四层长什么样

### 3.1 第一层 header — 干净一行（Jess 2026-07-11）

`[状态胶囊 + 一句短讯息] #1153 CR0902 ················ [⋮] [✕]`

例：`⛔ On hold delivery   #1153  CR0902`

| 放 | 为什么 |
|---|---|
| 状态胶囊 + **一句短讯息** | 只讲**发生什么**：`On hold delivery` / `Ready to deliver` / `等供应商 ETA`。6 阶段自动算 |
| `#1153` | 这单的名字。整个 panel 只出现这一次 |
| `CR0902` | 旧系统 ref，跟客人对话要念。只读 |
| `⋮` `✕` | 次要动作 / 关闭 |

**header 只讲 WHAT，不讲 WHY。**
`On hold delivery` 为什么 on hold（欠多少、几时到期）→ **Payment panel 去 summary**（§3.3），不塞进 header。
金额、日期、下一步细节 —— header 一律不放，各自回自己的卡。这才是「干净」。

**砍掉**

| 砍 | 去哪 / 为什么 |
|---|---|
| `Owing RM 1,240` | → Outstanding 卡。那是钱不是身份，而且 DB 没这个字 |
| `交期 24 Jul` | → 归追货线。客户交期就是送货死线，写两次是骗人 |
| 客人名 / 电话 / 地址 | → Customer 卡。第一层不认人，只认单 |
| `In Production` | 人手填的假状态 |
| `+ Issue POs` | PO 下了还叫人下 PO。主按钮只能是「下一步」 |
| `Rescheduled ×N` 贴纸 | 改期过的单 = 0，永远不出现 |
| **`Chase supplier` / `Chase logistic` 按钮** | **删。没功能** —— 按了 portal 里什么都不变。真正的动作是打电话 / WhatsApp 去问，问到了**人手填栏位**。见 §3.5 |

> ⚠️ **「下一步」是文字，不是按钮**（Jess 2026-07-11）。
> 例如 `等供应商 ETA` / `等物流回覆` / `可安排送货` / `等收尾款` —— 它只是**告诉 Ching 现在卡在谁那里**。
> 它 **不点，不做事** —— 因为真正让数据变的动作（填 Stock ETA、填 logistic ETA）是别人回覆你之后，你**手填那个栏位**。
> 这个文字由 `nextAction(order)` 算出来（§5 积木 ⑤），同一个值也喂给列表页和 COO 例外清单。

### 3.2 第二层 —— 删掉。没有追货线（Jess 2026-07-11）

原本这里有两条线（SUPPLY / DELIVER）。**整个拿掉** —— 它们在重复每件货的 stock 状态，而 stock 状态本来就该在 items 表里，一件一行。上面再画一次 = 重复。

- **Stock 状态 → 搬进 items 表**：表头放一个总结（例 `Stock 2/3 ready`），每件自己一行看自己的状态 + Stock ETA（§3.4）。
- **Stock ETA 还是自动算**（`= 客户交期 − lead`，供应商说迟才覆盖）—— 只是它现在住在 items 表的那一栏，不在什么「线」上。数据：92 张有 ETA 的单，平均落在交期前 6 天。
- **DELIVER 线** 本来就 0 数据（`logistic_eta` 1/168、`delivery_stops` 0/168），更不画。
- 客户交期 = 一个日子，不是一条线；它的用途是算 Stock ETA + 判断 on hold，不需要单独占一层。

### 3.5 栏位怎么填 —— 为什么没有 Chase 按钮（Jess 2026-07-11）

| 栏位 | 默认值哪来 | 谁改它 |
|---|---|---|
| Stock ETA | **系统自动** = 客户交期 − lead,一开始就有 | 供应商说会迟 → ops **覆盖**那一件（晚过自动值就变红） |
| Logistic ETA | 无（现在空着） | **物流回覆** → ops 手填。物流不回,这栏就该空着 |

**两栏都不需要「Chase」按钮**:
- Stock ETA 本来就自动有值,没有要「去追」的空栏。
- Logistic ETA 要靠 portal 外面的动作(打电话/WhatsApp)拿到答案 —— 一个点了 portal 不变的按钮是假的,**删**。portal 只负责:问到了,把答案填进栏位。

> **以后**（不是现在):物流伙伴自己登入 portal 填 logistic ETA / mark shipped。
> 那时才需要给物流一个入口。现在物流还在 WhatsApp 上,ops 代填。
> 所以 `logistic_eta` 现在 1/168 —— 不是栏位坏,是「谁来填」这件事还没建。

### 3.3 左栏 — 2 张卡，不是 4 张

**Customer**（168/168 全满）— 名 / 电话 / 地址，`place` 状态可内联编辑。

**Payment**（红边 + 「挡住送货」）—— **这张卡负责 summary 「为什么 on hold」**（Jess 2026-07-11）
```
Outstanding   RM 1,240        ← 客户还欠（读 ops_order_control.balance）
Due           24 Jul（今天）   ← header 的 On hold 就是它引起的
On hold: 交期当天,尾款未到
```
header 只写 `On hold delivery`（干净）；**这里补上一句话说清楚**：欠多少、几时到期、为什么挡住。
一眼 refer 得到 —— header 说结果，这张卡说原因。
Total / Collected 先不显示（单价 167/168 = 0、`paid_amount` 0 行，写出来骗人）。

**砍掉：** `Delivery` 卡（0 legs）· `Storage` 卡（`storage_from` 0 行 —— 跟原规格「只有 storage fee 时才显」同一个道理）。

### 3.4 右栏 items —— stock 状态在这里，每件可展开（Jess 2026-07-11）

**表头带 stock 总结**（第二层删掉后，stock 状态的家在这里）：
`Items · Stock          [Stock 2/3 ready]`

**收合时 5 栏 + hover 动作：**

| Status | Item | Qty | Stock ETA | PO | *(hover)* |
|---|---|---|---|---|---|
| `Waiting` | `HK5531/28"(2 Seater+L…` | 1 | *可填* | `PO/2607-019` | `Receive` |

- `Item` 那串生字 **一行到底，不断行**，太长切掉，滑鼠停上去看全名。
- `Stock ETA` **每件可填可改**（自动 = 交期 − lead；供应商说迟才覆盖）。
- `Receive` 按钮**滑过那行才出现**。
- **砍掉的栏**：`Size`（不存在，425/427 SKU 是生字）· `Warehouse` / `Recv` / `Receive-at`（旧的只读空栏）。

**展开一件 = 看它的 stock 怎么搬**（§3.6）：
```
▾ 床架 1013-K BEDFRAME · ×1
  现在在：Hookka（供应商，还没收货）
  这单派了：AL
  指令（原 Carres Remark）：AL pickup bedf at Hookka        ← 系统建议，可改
  物流回覆：Pending Logisitc                                 ← 物流填，或分享 link 给 AL 自己填
  [改指令]  [标记完成]
```

缺货 / 或「take ready stock」→ 展开「仓库现货 · 可对」，默认折叠（见 §3.7）。

### 3.6 每件货的搬货追踪（Jess 2026-07-11 · 进 order panel，不另开 panel）

**今天这套逻辑长什么样（10 Jul 三个真档案研究出来的）：**
搬货指令现在就是一句**手写文字**，写在 Master 的 `Carres Remark`。真实样本：
`AL pickup bedf at Hookka` · `AL pickup sofa at hookka` · `TAKE READY STOCK @ PO/2604-042 RF2607` · `follow up with hookka the new eta`。
物流回覆写在 `Logistic Remark`：`Completed` / `Pending Logisitc, Customer Rescheduled`。
**一段一段来,不预排整条链**（Jess 的写法就是单一指令，数据证实）→ 系统只记「现在这一段」，做完更新位置，再排下一段。

**要结构化的,只有 pickup 指令 + 物流状态。其余保留一格自由 remark**（`Carres Remark` 还混着 storage fee、ETA 跟催等杂事 —— 全部结构化会让 Jess 更难用，§ feedback「别 over-engineer」）。

**最终收货点 auto 默认 = Carres Klang**。派了物流,目标改成「把货弄到物流拿得到的地方」。
**系统照规则「建议」一个搬法,ops 可以改**（不是每件手选）。规则表（AL 例子 + 档案里的 remark 佐证）：

| 货 | 现在在哪 | 建议搬法 | 谁做 |
|---|---|---|---|
| 配件（Pillow / MP） | Carres Klang | 叫 **Lalamove** 送去物流 | Carres 叫车 |
| MS（床垫） | 在 Carres Klang | 叫 **NETS** 送去物流 | 叫 NETS（NETS 管这仓） |
| MS（床垫） | 还在 NF（NETS 没收） | **HOUZS pickup → HOUZS 仓** → 物流去 HOUZS 拿 | 叫 HOUZS（借它的仓中转，因 AL 无仓） |
| BF / Sofa | 还在供应商（Hookka / Ohana / Dorsettloft） | **物流去供应商 pickup**（`AL pickup bedf at Hookka`） | 叫物流 / 供应商直送 |

**⚠️ 要补的数据（比想像小 — 骨架已存在。Jess 是 operation 老板，migration 她自己拍板）：**
- ✅ 已有：`order_supplier_threads` 每件货一行，**已经**有 `warehouse_id`（收去哪个仓）+ `delivery_partner_id`（派哪个物流）+ 供应商 ready / partner 签收 / POD 栏。0 行,从没写过,但位置在。
- ➕ 要加：**「搬法 carrier」**（Lalamove / NETS / HOUZS-pickup / 供应商直送）—— 这是你强调的「怎么搬」,现在唯一没栏位的东西。加在 thread 上。
- ➕ 要加：**HOUZS Balakong** 一个仓（`warehouses` 现在只有 Carres Klang 一个）。
- ➕ 代码（非 schema）：`suggestTransfer(item)` 纯函数 = 上面规则表,建议一个搬法给 ops 改（跟 `nextAction` 同款，逻辑积木）。
- 角色澄清（Jess）：**AL = 纯物流（无仓）** · **HOUZS = 物流 + 有仓（Balakong）** · **NETS = 物流 + 管 Carres Klang + 去 NF 收货** · NF/Ohana/Dorsettloft/Hookka = 供应商。有仓的只有 Carres Klang + HOUZS Balakong。

### 3.7 「Take ready stock」—— 你工作的一大块（10 Jul 档案发现）

很多单**不是等供应商**,是从 **Carres Klang 现货**拿,用 PO / RF ref 对（remark 满是 `TAKE READY STOCK @ PO/2604-042 RF2607`）。
Carres Klang 现在 **87 件现货**（43 床架 + 33 床垫,全部 Free）。
→ items 展开时,若同 model+size 有 free 现货,显示「可对 N 件」+ 一键 reserve 到这单（原规格的「仓库现货可借」,但这是**主流程,不是边角**）。
数据源 = `stock_balances`（40 行）/ `ops_stock_items`（71 行）+ 要 import 这份 Klg Warehouse 87 件。

### 3.8 未来：物流看自己的单（Jess 2026-07-11）

> 未来物流能登入 portal 追踪自己的活;就算最后不用,至少给条 link 看进度。

这就是 Master 里的 **per-logistic 分页**（NETS 112 单 / AL 4 单...）—— 每个物流看自己被派的单 + Carres 的指令,填自己的 `Logistic Remark` / `Logistic ETA` / `Delivery Time`。
**骨架已存在**：portal 有 **Partner 角色**（Phase 7）+ `order_supplier_threads.delivery_partner_id` + partner 签收/POD 栏。
两条路（未来做,不是现在）：(a) 物流登入 Partner portal 看自己的单;(b) 一条**只读分享 link**（客户 tracking link 同款）给不想登入的物流看进度。
**现在**：ops 代填物流状态（`logistic_eta` 现在 1/168 —— 不是栏位坏,是「谁来填」还没建）。

### 3.9 订单层 Carres remark → 并进 Activity timeline（Jess 2026-07-11 · 选 Option 1）

**决定：砍掉订单面板那个单格 `carres_remark`（代码 label "Carrier's remark"，`OrderDetailDrawer.tsx:1640`）。一张单所有人手写的话,只有一个地方 —— 右边那条已上线的 Activity timeline。**

为什么不留单格来 follow up：
- **单格会被盖掉** —— 一格只留最后一句,follow-up 的来龙去脉丢了。
- **没有谁 + 几时** —— follow up 要看得到是谁、什么时候写的。单格没有。
- **没有历史** —— timeline 一条一条叠,单格永远只有一行。

规矩:
- note 黏哪张单 = **从哪张单里写的**（面板上的写字框就长在这张单上,系统自动黏,不用选单）。
- **导入的旧 Carres remark 不丢** —— 迁移时把每张单现有的 `carres_remark` 文字**转成该单 Activity timeline 的第一条 note**（标 source = Master sheet import）,再砍字段。
- 这跟 §3.6 的「每件货 pickup 自由 remark」是**两回事** —— 那个属第 4 步搬货追踪(每件一格,结构化 pickup 指令旁边的自由格),Option 1 不动它。

**排进哪一步:** 这是「外观 + 逻辑」范围,不碰搬货 schema —— 归 **第 2 步**(照 §3.1–3.4 砍到只剩真数据)一起做。timeline 已存在,这里只是**接进去 + 一次性迁移旧 remark**,不新建 timeline 机制(§7「不要重做」)。

---

## 4. 比设计更急的两件事

### 4.1 没人填数据

`logistic_eta` 168 张单只填过 1 张。`line_received` 一次都没用过。
**这些栏位不是坏的，是没人填。** 设计救不了空栏位 —— 得让「填」变成下一步动作。

Ching **2026-07-20** 上班，再一个新人 **2026-08-01**。三个 ops 里两个全新。
她打开 #1153，画面必须用**人话**告诉她现在做什么 —— 否则她来问 Jess，而 Jess 想摆脱的正是这个。

### 4.2 `nextActionOf` — 一个函数，三个地方

它**已经存在**，`OperationOrdersControl.tsx:345`，export 了 —— 但埋在一个 2273 行的列表页里。
要用它得把整个列表页拉进来，所以没人用，所以它坏了也没人发现（Jess 的瑕疵 #2：每单都写 `Supplier overdue`）。

搬进共用模组，三个地方一起吃：

1. **订单面板第一层** 的那个按钮 —— Ching 一眼知道做什么
2. **列表页 `Next action` 栏** —— 修好瑕疵 #2
3. **COO 例外清单** —— 「卡超过 N 天的单」自动浮出来，Jess 只看这些

---

## 5. 共用积木（其他 panel 直接拼）

| 积木 | 谁用 |
|---|---|
| ① 表头样式（cream + 0.5px 细边，不是黑底） | Order · Receiving · Stock · Payments · Service Cases |
| ② 状态 pill（浅色 pastel，只 alert 才饱和；**没有紫色**） | 全部 |
| ③ Panel 细边框（框住不填色，可折叠，记 localStorage） | Order · Stock · Service Cases |
| ④ Outstanding 金额行 | Order · Payments |
| ⑤ **`nextAction(order)` 纯函数** ← 唯一一块逻辑积木。算出「现在等谁」的**文字标签**，不是按钮 | Order · Orders 列表 · COO 例外清单 |

瑕疵 #3（列表页黑底表头 + 紫色 `Proceed` pill）之所以会发生，正是因为 ① ② 还没抽出来。

---

## 6. 顺序（不能换）

**第 0 步 — 先合房子。** 三份 `OrderDetailDrawer.tsx` 在打架：

| 在哪 | 行数 | 内容 |
|---|---|---|
| `main` | 2458 | 旧的 |
| `phase/10-order-detail-layout-redesign` | 3066 | batch 1+2 **＋ 203 个 file**（migration 0200–0210：storage fee / sofa loan / service cases） |
| `feat/orders-drawer-redesign-batch3` | 2798 | 锁定的新设计，但**分叉自旧 base `61ed598`**，没有那些 migration |

`git merge-tree` 已确认：合并会在这个 file 冲突。当前 branch 还落后 `origin/main` **25 个 commit**
（CLAUDE.md §17.5 `phase-11-deploy-verify-branch-has-latest` —— 上次这样直接上线，把别人做好的东西弄不见了）。

→ 把 batch3 的两个 commit（`ab31279`、`78de284`）rebase 到 phase/10 上面，冲突只解一次，**以 batch3 那份为准**。

**第 1 步 — 主题对齐（方案 B）**：去掉深色 header，drawer + 列表页表头改浅色 lining（§10 主题）。顺手修瑕疵 #3（紫 Proceed pill）。**不用改 DB。**

**第 2 步 — 照 §3.1–3.4 砍到只剩真数据**（干净 header + Payment summary + items 表 stock 状态）。**不用改 DB。**
（Money 卡不用碰 —— §2 查过，是好的。）

**第 3 步 — 抽 5 块积木**（§5），顺手修好瑕疵 #2。**不用改 DB。**

> ⬆️ 第 0–3 步 **完全不碰 schema** —— 可以先做、先上线、先让 Ching 用。搬货那块（要改 DB）单独排在後面。

**第 4 步 —（要改 DB，Jess 自己拍板）搬货追踪 §3.6**：
加 HOUZS Balakong 仓 + 在 `order_supplier_threads` 加「搬法 carrier」栏 + `suggestTransfer()` 函数 + items 展开 UI。
（技术注意，不是审批关卡：这是 shared Supabase，migration 影响 production，所以只做 additive、不动别人的表 —— 但这是 Jess 的决定，不经过任何人。）

**第 5 步 —（可选，之後）take ready stock §3.7 · 物流分享 §3.8。**

**封版** = 第 0–3 步做完 = order panel 的**外观 + 逻辑**定案，其他 panel 可以开始拼积木。第 4–5 步是它的**功能延伸**，不挡其他 panel。

---

## 7. 明知道、故意留着的

- **lead 天数写死** `{mattress:7, bedframe:7, sofa:5}`（待 Jess 最终确认数字）。
  用途:**Stock ETA 自动值 = 客户交期 − lead**（§3.2）。系统一开始就给这个值,供应商说迟才覆盖。
  数据佐证:92 张有 ETA 的单,ETA 平均落在交期前 6 天 —— 跟 ~7 天 lead 吻合。
  供应商变了、lead 变了,Jess 自己改不了,要找人改 code → 先写死(不 over-engineer),**记下来**,等它咬人再搬进 DB。
  注意:**不要**用 `delivery_fee_config` 的 14/21 —— 那是运费用的,不是这个 lead。
- **Activity timeline 已经上线了**（2026-07-10，PR #102–#104），住在右边那条 rail：每单完整历史 + 全局搜索。
  **不要重做。** 把「下一步」跟它接起来 —— 新人靠它读懂一张在飞的单。
- **NETS 权限**：只碰送货线（GRN、Stock ETA、mark shipped、sign-off、排期确认、自己的物流 remark）。不能碰钱，不能碰别的 partner 的单。
- **🎨 主题 = 对齐 Orders 列表页（Jess 2026-07-11，方案 B）。** 拿列表页当唯一标准，但 **header 不再深色**：
  - 页面底色 `#ECE8E0`（暖灰，列表页实际值 —— **不是** CLAUDE.md 写的 #F5F1EA）
  - 卡片白底 + 细边框 `#DDD8CE` / `#E5E1D8` + 软阴影 `0 1px 2px / 0 4px 16px rgba(34,31,32,0.04~0.05)`
  - 标题 `t-h1 font-display`
  - **去掉所有深墨黑 header**（列表页表头 `#221F20` band、drawer 顶栏、section 表头）→ 改浅色 lining：cream/pale 底 + 0.5px 细边 + 小写 uppercase 灰标签。这**同时改列表页**（`OperationOrdersControl.tsx` 表头 band + 选中 tab + 批量条），顺手修掉瑕疵 #3。
  - flame `#C44D2B` 只用在 logo + 选中的 filter chip · 紫色 Proceed pill **删**（不在色板）· 主按钮黑底白字（按钮可深，header 不深）· Inter · REF 13px / 内文 12.5px / 次要 10px 灰。

## 8. 工作方式（Jess 2026-07-11 定的规矩）

- **没想清楚 critical plan 之前，不画。** 先把逻辑讲清楚，确认了，才画。不要拿画图代替思考。
- **画图一律全英文**，一个中文都不放（画面是给 ops 团队看的，英文）。聊天可以中文。
- **不做假动作。** 一个按钮如果点下去 portal 里什么都不变（Chase supplier / Chase logistic），就不放。真正的动作在 portal 外面（打电话）→ portal 只负责把答案填进栏位。
- **「谁来填」是 UI 之外的问题。** 栏位空（logistic_eta 1/168）多半不是 UI 坏，是还没建「谁来填」的流程。别在空栏位上叠更多 UI —— 先想清楚谁、什么时候、怎么填。
