# HANDOVER — 任何新 chat 第一步读这份,不读旧对话
> 2026-08-09 · Sales Orders 研究结束,进入建卡

## 现在在哪
- SO-2 研究跑了 6 轮,**已结束**。Owner 待答问题:**0**
- 建卡已写好:`docs/BUILD-QUEUE.md`,分三个 STAGE,从上面做起
- 每个 STAGE 各自可以 merge,各自有一个画面给老板看

## 唯一的工作流程(不要发明新的)
1. build chat 读 `docs/BUILD-QUEUE.md`,做最上面的 ☐ STAGE,打勾+commit hash,停
2. 架构师逐格验收(findings + PASS 或 FIX-LIST),才轮到老板
3. 老板只看画面打分,只说 "next" / "approved" / 指着哪格不对
4. 新想法一律进 BUILD-QUEUE 的 PARKING LOT,永不打断当前项

## 最高裁决:COPY 2990
2990 已经跑了两个月。抄它的机制,Carres 出数据。
只有两个 Carres 改良:**右栏内嵌即时 PDF 预览** · **Columns 选单分 8 组**。
栏位是 array 里的一行,以后不合再删。不要为了栏位选择开会。

## DECIDE BY DEFAULT(治理,新增,永久)
```
RUNNING CODE                → law,冲突才 escalate
DOC / OLD CARD WITHOUT CODE → evidence,architect 自己判,不准做成 owner question
LATER OWNER STATEMENT       → 覆盖旧文字,旧裁决作废
```
上报前先跑三问并贴出来:有 code 吗?老板讲过吗?COPY 2990 答得了吗?
任一个 yes → 自己决定。三个都不行**而且**牵涉钱/权限/对客户的承诺,才上报。

## 已冻结、不准重开
- Sales Orders = REGISTER:搜寻/筛选/排序/选取/查看/汇出。不做 workflow。
- 一个 workspace 三个模式:`/new` CREATE · `/:so` VIEW · `?edit=1` EDIT。
  没有 quick panel,没有第四套 UI。
- 三测法(独立,不互相升格):
  T1 客户三问变了吗 → A 合约变更 / B 更正
  T2 谁依赖了旧值 → 下游 correction work
  T3 新值搬钱/权限/归属吗 → 要审批
- 历史永不覆写。Rev 1 = 原始。旧版可只读、可重印。
- 审批绝不静默改写 PO / 收货 / 送货 / 收款,只发 correction work 给该模块。
- 成本 / 毛利不做(成本归 Purchasing)。

## 两个月的教训(新 chat 必读)
- 23 份规划文件死于"再挑战一轮"。**落地 > 完美。**
- 抄档案,不抄概念。
- 验收 = 老板的眼睛,不是文档。
- AI 每次只读 3 份:`CLAUDE.md` · `docs/ui-reference/00-register-laws.md` ·
  `docs/BUILD-QUEUE.md`。其他点名才读。
- 引用规则:每一个 file:line 必须附 `grep -n` / `sed -n` 的原始输出。
  失败的命令按失败报告。没证据就写 UNVERIFIED。
