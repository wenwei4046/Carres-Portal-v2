# Orders Page — Listing Redesign (Phase 1: 只改外面列表)
> 只改列表(header + listing)。详情面板这次不碰,之后另外讨论。
> 开工前先读这份。设计值全部用 repo 现有 token,不新造 hex。
> Confirmed by Jess · [date]

---

## 范围 (只做这些,别越界)
✅ 改:header 三层重排 + listing 布局/栏位/20行 + bulk bar 外观
❌ 不碰:详情面板(OrderDetailDrawer / OrderControlPanel / 右侧四抽屉)
❌ 不碰:count 算法、readinessOf / stageOf / STOCK_BUCKETS 共享逻辑

---

## 这页在干嘛
Carres 是 outsource、要追很多 party(供应商/NETS/TSDD/法国下单方),
东西容易掉环节没人跟。这页核心 = **一眼看出「哪里漏了、该追什么」**。

---

## Design kit (全用 repo 现有值,禁止新造)
| 项 | 值 | 来源 |
|---|---|---|
| 背景 BG | #F5F1EA cream | --background |
| 品牌 Accent | #C44D2B | --primary |
| Dark 文字 | #111827 | --foreground |
| 卡片 | 白底 + 8px radius + 现有 .card | index.css:177 |
| 字体 | Inter | 现有 |
| 图标 | lucide-react ^0.453 | 现有 |
| 状态色 | 复用现有 .pill-* | index.css:200 |
| 日期格式 | 11 Jul 26 + Sat + 3d left (三段分开) | 新锁 |

## 颜色纪律 (最重要)
- 颜色 = 意思。只出现在 Next action 栏 + Alert banner。其余中性。
- 分区靠线不靠色:白底 + 细灰线 rgba(17,24,39,0.08) 分隔,不给分区上底色。
- 一行只有一个彩色(Next action pill)。不要一行紫+黄+红。
- pill 有同色圆角边框(浅底在 cream 上会糊,加边框才清楚)。

## 日期设计 (三段,不用 dot 黏一起)
11 Jul 26 [黑粗 #111827]  Sat [浅灰 #9CA3AF]  3d left [小药丸,快到期变红]

---

## HEADER (三层)
1. 标题 + 功能按钮(右上):Search · Import Master · Import AutoCount(品牌橙)。
   Export/Print 移到 bulk bar,不放这里。
2. Alert banner(动态,有事才出现):系统主动提醒,
   例 "12 orders from AutoCount need confirming — placed but not confirmed" + Review 按钮。
   多条收成 "3 alerts ▾"。
3. 漏单雷达 + Overview:
   - 雷达药丸(可点筛选):No ETA / No PO / Urgent / Attention / Follow-up,红琥珀蓝分级。
   - Overview(Region/Type/Stock 分布)默认收起,点 ▾ 展开。
   - ⚠️ count 算法不要动(改坏连带 ~36 测试),只重排外观。

## LISTING
- 20 行/页 + 开 compact(现锁死 15、compact 没启用 → 改 pageSize 常数到 20,
  ≥20 会自动开 compact)。保持现有滚动/分页。
- 6 栏:Order · Customer · Region · Deadline · Next action · (Logistic)
- 去掉左边橙色竖线。行高统一(item 明细留给详情,列表不显示)。
- Deadline 三段格式,快到期红。
- Next action 取代现在 Proceed(紫)+ Waiting(黄):一句人话指令。
  接现有 stageOf/readinessOf 算,4 盏灯逻辑:
    有欠款到期→Collect payment(红) | 没ETA→Chase ETA(红) | 没PO→No PO order it(红)
    ETA超期→Update ETA(琥珀) | 等货→Waiting stock(琥珀)
    货齐没排→Schedule delivery(绿) | 排了没确认→Call customer(蓝) | 送达→Done(灰)
- 选中行 → 顶部深色 bulk bar:X selected · Assign logistic · Export · Print · Mark done · Clear。
  (这四个动作现有的都能用,不用重做功能。)
- ⚠️ 别碰:row 的 inline-edit(add remark/logistic_eta)+ 整行点击开详情,
  靠 stopPropagation 分开,改布局容易弄坏这两个点击目标。

---

## 危险区 (改列表最容易踩坏,来自真实代码)
1. STATUS/STOCK/DUE 的 count + label 格式 —— 改文案要连 ~36 个测试一起改。
2. 共享 readinessOf / stockMatchKey / STOCK_BUCKETS —— 动了详情的 Ready/Waiting 也坏。
3. row inline-edit + 点开详情两个点击目标 —— 改布局容易破坏。

## 怎么改
Level A(改 UI flow):先讲计划 + 画 ASCII + 等 Jess 批准,才写 code。
改 label/count 连测试一起改。改前 git fetch origin/main(避免 migration 撞车,虽然这次多半不用 migration)。
