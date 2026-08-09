# SALES ORDERS · MIGRATION MAP
> Frozen 2026-08-08 · 每天挑 Dependency=Ready 的项搬 → commit → ⬜ 改 🟩
> 全表变绿那天，旧 OperationOrdersControl.tsx 才可删除。

## FROZEN PRINCIPLES（冻结的是原则，不是方案）

1. There must be ONE operator truth. No duplicate operator surfaces.
2. Sales Orders owns only customer-order facts. Execution belongs to execution modules.
3. One fact has one owner.
4. Cross-module business logic must have one authoritative source.
5. The architecture must support 1,000+ orders/month.

方案（Customer Order Register 还是 Register + Promise Monitor）属于 OPEN，
由每张卡的 Architecture Review 用证据挑战。挑战每卡一轮，批准后进停车场。

## REGISTER ACCEPTANCE TEST（永久 · 适用所有 Register：SO/PO/Receiving/Payments/Claims）

任何 code review 之前先做。给老板一张真实订单，30 秒内必须完成：
1. 找到订单
2. 看懂这张单
3. 回答客户三个问题：我买了什么？答应什么时候？现在发生什么？

30 秒做不到 → 不讨论 code、不讨论架构，直接改 UI。

草图验收（Sketch 阶段，三问全 Yes 才开建）：
- 5 秒内看得懂吗？
- 客户打电话来，60 秒内能回答吗？
- 愿意每天看这张表 8 小时吗？
任何一个 No → 改画面，不改 prompt。

## MAP

| Feature | Decision | Owner | Dependency | Status |
|---|---|---|---|---|
| Search / Export / Print | KEEP | Sales Orders | Ready | ⬜ |
| 改地址 · 品项 · 改期 · 取消 · 变更历史 | KEEP | Sales Orders | Ready (drawer 已有) | ⬜ |
| 事实栏（电话·销售员·门市·来源单号）默认隐藏 | KEEP | Sales Orders | Ready | ⬜ |
| Raise PO · 催/问供应商 | MOVE | Purchasing | Ready (To Order 已能做) | ⬜ |
| 约送 · 开DO · 送货照片 · 派车 · 多段路线 | MOVE | Delivery | Ready (12 hooks 在 queries.ts) | ⬜ |
| 收款 · 免仓租 · 延期仓租 | MOVE | Payments | Ready (收款台已上线) | ⬜ |
| Next Action → 各模块 queue | MOVE | 各模块 | Ready (引擎在 shared) | ⬜ |
| Stock 栏 · 备货判定 · 供应商 ETA | MOVE | Purchasing | **API**（计算目前只在浏览器） | ⬜ |
| Where / 四线摘要栏 | NEW | 模块提供 · SO 显示 | **API** | ⬜ |
| 全量搜寻 + 分页（破 200 上限） | NEW | API | **API** | ⬜ |
| TEAM 分单 · PO 值日 | MOVE | Dashboard | **Blocked**（无家） | ⬜ |
| Status三线点 · slack排序 · DEADLINE桶 · ⚑ · PIC | HIDE→观察→DELETE | — | None | ⬜ |
| AutoCount汇入 · Import ETA · 猜州属 · 猜品类 · FIX DATA | DELETE | — | None（AutoCount 退役） | ⬜ |

## 已知债务
- API `.limit(200)`（operation/orders.ts:192）— NEW 项处理
- TEAM 分单无家 — Dashboard 卡处理

## PARKING LOT（批准后的新异议放这里，下一张卡再审；prompt 已永久封版）
- （空）
