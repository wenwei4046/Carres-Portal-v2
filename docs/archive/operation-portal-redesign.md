# Operation Portal — concrete redesign (for Jess)

> Status: DRAFT for approval, 2026-06-08. Plain, concrete target so Jess can picture it.
> Goal: get the portal usable for daily ops NOW (it should have gone live last month).

## Sidebar — 5 items, no jargon groups

```
Carres
  总览     Dashboard
  订单     Orders        ← the heart (= your Master Sheet)
  收货     Receiving     ← was "Procurement": see AutoCount POs + receive goods
  库存     Stock
  目录     Catalog       (SKUs + suppliers)
  [avatar]
```
Deleted: Pulse, Pipeline, AutoCount, Klang Stock, Network, Cases (all jargon / duplicates).

---

## 1. 订单 Orders  (the main screen — used all day)

The unified control center. Every order — AutoCount-imported now, salesperson-keyed later —
lands here. Source shown by ref prefix (CR/TCF/DL = AutoCount, SO = salesperson).

```
订单                                  [+ 从 AutoCount 导入]   [🔍 搜索]

[ 新单 12 ] [ 备货中 8 ] [ 已排期 5 ] [ 已送达 ] [ 全部 ]   ← 状态筛选
────────────────────────────────────────────────────────────────────
单号       客户          货品            交期    库存    物流    状态
────────────────────────────────────────────────────────────────────
CR0418     Felix Koh     床垫×2 床架×1    06-30  ✅备货   NETS   备货中
           012-639…      +枕头×6
────────────────────────────────────────────────────────────────────
TCF0449    CC            沙发×1 set       —      ⏳缺货   —      新单
           016-382…
────────────────────────────────────────────────────────────────────
SO-1052    Ali(销售)    床垫×1           07-15  ✅备货   NETS   已排期
           011-…
────────────────────────────────────────────────────────────────────
```
- Top tabs = the status flow (your `Logistic Remark`: 新单 → 备货中 → 已排期 → 已送达).
- `导入` button pulls the AutoCount listing in (no separate "Inbox" menu).
- Click a row → the control drawer (below).

### Order drawer (click a row) — full control = one row of the Master Sheet
```
CR0418 · Felix Koh                                              [×]
──────────────────────────────────────────────────────────────────
客户   Felix Koh · 012-6399285
地址   18, Jalan Cempaka Sari 5, … Muar, Johor
货品   床垫 Breeze FirmCare-K ×2 · 床架 ×1 · 枕头 ×6
PO     PO/2604-006   (来自 AutoCount)
──────────────────────────────────────────────────────────────────
库存    ✅ Ready    /   ⏳ 缺货  ETA [______]            ← 可改
物流    [ NETS ▾ ]   (按 Muar→Johor 建议 TT/TEOW)        ← 默认+可改
送货日  [ 06-30 ]    时段 [ 上午 ▾ ]                      ← 可改
──────────────────────────────────────────────────────────────────
客户要求 [ postponed to end of May________ ]
给物流   [ call cust first______________ ]
内部备注 [ ____________________________ ]
──────────────────────────────────────────────────────────────────
收款    RM 1918 未收     状态 [ Follow Up ▾ ]
──────────────────────────────────────────────────────────────────
                       [ 标记已排期 ]    [ 标记已送达 ]
```
Everything = pre-filled default + manually editable (your rule).

---

## 2. 收货 Receiving  (was Procurement)

货到 Carres Klang,在这核收入库。PO 来自 AutoCount,你不用手动开。

```
收货                                                       [🔍]
──────────────────────────────────────────────────────────────
PO             供应商        货品        状态
──────────────────────────────────────────────────────────────
PO/2604-006    Nice Future   床垫 ×2     待收      [ 收货 → ]
PO/2604-089    OHANA         沙发 ×1     部分收     [ 收货 → ]
PO/2603-065    Nice Future   床架 ×2     已收 ✅
──────────────────────────────────────────────────────────────
```
点「收货」→ 逐件核收弹窗(床垫逐件 ID 打勾、记状况),收完该 PO 的货进 Carres Klang。

---

## 3. 库存 Stock

```
库存 · Carres Klang                                        [🔍]
[ 床垫 ] [ 床架 ] [ 沙发 ] [ ⚠ 低库存 ]
──────────────────────────────────────────────────────────────
货品                    在仓   预留   可用   状态
──────────────────────────────────────────────────────────────
Breeze FirmCare-K        12     3      9    OK
Haven FirmCare-K          2     2      0    ⚠ 缺      [+ 调整]
──────────────────────────────────────────────────────────────
```
**子分页(全部保留,绝不删):** `Balance 结存` · `Ready` · `Reserved` · `Repair` · `Inventory` · `Movements 流水`。
只是从顶层收进 **Stock** 一个菜单下当分页 —— 功能一个不少,只是不再各占一个顶层位置。

---

## 4. 目录 Catalog
```
目录    [ SKU ]  [ 供应商 ]
SKU 列表(料号/名称/供应商/成本) · 供应商列表(NETS/Nice Future/OHANA…)
```

---

## 5. 总览 Dashboard
```
总览 · 6月8日
[ 今日送货 3 ]  [ 待处理 12 ]  [ 缺货 5 ]  [ 逾期 2 ]

今日排期:
- CR0418 · Felix Koh · Muar · NETS · 上午
- TCF0410 · ENG · Seri Kembangan · HOUZS · 下午
```

---

## Build order (fastest path to "usable")

1. **Sidebar 改成这 5 项**(快)
2. **订单 控制台**(合并 Inbox+看板+All orders,加上可编辑的运营栏 + 状态 tab + drawer)← 最大块,天天用
3. **收货** 改名 + 逐件核收
4. **库存 / 目录** 多半已存在,清理合并
5. 之后:物流自动建议、SO# 配对(开放销售直接下单前)
