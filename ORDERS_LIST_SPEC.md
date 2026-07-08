# Orders Page — Listing Redesign (Phase 1)
> 只改列表(header + listing)。详情面板不碰,之后另外讨论。
> 开工前先读这份。设计值全部用 repo 现有 token,不新造 hex。
> Confirmed by Jess · 2026-07-08

═══════════════════════════════════════════
## 范围
✅ 改:header(可折叠三层) + listing(钉住分区 + 栏位 + 字体) + bulk bar
❌ 不碰:详情面板(OrderDetailDrawer / OrderControlPanel / 右侧四抽屉)
❌ 不碰:count 算法、readinessOf / stageOf / stockMatchKey / STOCK_BUCKETS 内部
⚠️ 改 label 连 ~36 个测试一起改。改前 git fetch origin/main。
   文件:主要只碰 OperationOrdersControl.tsx + 测试。按 Level A(先讲计划+ASCII+批准才写)。

═══════════════════════════════════════════
## 这页在干嘛
Carres outsource,要追很多 party(供应商/NETS/TSDD/法国下单方),东西易掉环节没人跟。
这页核心 = 一眼看出「哪里漏了、该追什么」。

═══════════════════════════════════════════
## DESIGN KIT (全用 repo 现有值,禁止新造)
| 项 | 值 | 来源 |
|---|---|---|
| 背景 BG | #F5F1EA cream | --background |
| 品牌 Accent | #C44D2B | --primary |
| Dark 文字 | #111827 | --foreground |
| 卡片 | 白底 + 8px radius + 现有 .card | index.css:177 |
| 字体 | Inter (唯一) | 现有 |
| 图标 | lucide-react ^0.453 | 现有 |
| 状态色 | 复用现有 .pill-* + semantic (--success/warning/danger/info) | index.css |

## 字体对比 (关键:靠大小/粗细/颜色分层,不是全部一样大)
| 用途 | px | 粗细 | 颜色 |
|---|---|---|---|
| 标题 Orders | 21 | 700 | #111827 |
| REF (主) | 13 | 600 | #111827 |
| SO id (辅,REF下方) | 10 | 400 | #9CA3AF |
| 客人/内容 | 12.5 | 400 | #1F2937 |
| 数字(件数/金额) | 12.5 | 600 | #111827 + tabular-nums |
| 表头 | 9.5 | 600 | #C9C5BB 大写 + letter-spacing 0.05em |
| 星期/次要 | 10 | 400 | #9CA3AF |
| Next action | 10.5 | 600 | 状态色,做成 pill |
- 深色表头 bar = #221F20。视觉语言对齐 POS(文伟建的),但布局用密集表格,不抄卡片。

## 颜色纪律
- 颜色只出现在:Next action pill · Stock 圆点 · Alert banner · 雷达药丸 · 快到期日期。其余中性。
- 分区靠线不靠色:白底 + 细灰线 rgba(17,24,39,0.08)。
- pill 有同色圆角边框(浅底在 cream 上会糊)。

## 日期格式 (三段,不用 dot 黏一起)
`11 Jul 26`[黑粗,快到期变红#DC2626] `Sat`[浅灰] `3d`[小,浅灰; overdue 显示 "over"]

═══════════════════════════════════════════
## HEADER — 可折叠,三层
折叠状态用 localStorage 记住(跟 sidebar 一致)。

**第一层 — 标题 + 按钮 + 折叠 toggle**
Orders · 150 · date | [Collapse/Expand filters](黑,记住状态) · Search · Import Master · Import AutoCount(橙)

**第二层 — Alert banner** (动态,有事才出现)
系统主动提醒,例 "12 from AutoCount need confirming — placed, not confirmed" + Review。多条收 "N alerts ▾"。

**第三层 — 筛选 (可折叠)**
展开 = 全部数字直接可见(不用点); 收起 = 一条摘要线(留 No ETA/No PO/Collect$/Follow-up) + listing 长到 20 行。
- Needs action 雷达(红/琥珀/蓝药丸): No ETA · No PO · Collect $ · Follow-up · For Jess
- 6 张卡片(数字全显,可点筛选,可叠加): Due · Stock · Category · Region · Logistic · Status
  (全部复用现有 count,不动算法。这些是现有 header 的筛选,一个都不能少。)

═══════════════════════════════════════════
## LISTING — 钉住分区 + 密集表格
- 展开时 ~15 行,收起 header 时 20 行/页。保持现有滚动/分页。开 compact。
- 去掉左边橙色竖线。行高统一。

### 分两区 (Flag = 钉住置顶)
```
📌 Pinned · N   (淡橙底 #FDF7F3, 橙图钉, 钉住的单浮顶, 内部也按 deadline 排)
━━━━━━━━━━━  (2px 粗线 #D6D2C6)
All orders · by deadline · N   (正常区, deadline 排序不受钉住影响)
```
- Flag(pin)= 员工手动点亮 → 该单进 Pinned 区置顶,翻页不丢。再点 → 回正常区。
- 没钉任何单 → Pinned 区消失,纯 deadline 排序。

### 栏位 (11 栏)
`⚑pin · ☐ · Ref · Customer · Region · Deadline · MS · BF · Sofa · Stock · Logistic · Next action`
- Ref = 主(黑粗) + SO id 辅(灰小,下方)。日常认 REF,SO 是系统号。
- MS/BF/Sofa = 三栏各显数量(code 从 Master L 栏 `[BF/Kx1pc]` 解析类型)。空格显示淡 `·`。
- Stock = 圆点 + 词(四态): ●Ready(绿#166534) ●Waiting(琥珀#92400E,有PO等货) ●No PO(红#991B1B) ●Partial(深灰#374151,部分到)
- Logistic = 灰色(NETS/AL/TEOW…)。

### Next action (三线,系统自动算,读现有信号,员工可覆盖 override 需≥5字原因)
**钱线(红):** Collect $ · balance / Collect $ · MS/BF storage / Collect $ · sofa storage
**供应商线:** Supplier overdue(红) / Waiting stock(琥珀) / No PO · order it(红)
**物流线(蓝):** Logistic · no ETA / Assign logistic / Call customer
**完成:** Schedule delivery(绿) / Done(灰)
- ETA 字眼只给物流。供应商用 overdue/waiting/no PO,不用 ETA。
- 优先级(高先亮,一行只亮一盏): Collect$ > Supplier overdue > No PO > Waiting > Assign logistic > Logistic no ETA > Call customer > Schedule delivery > Done
- 供应商逾期判定: MS/BF = deadline 前 7 天(用 Master I 栏 Before 7 Days), Sofa = deadline 前 5 天。

### Payment hold (重要,来自 Master AM Balance + AP Payment Status)
有欠款未清 → 压下绿灯,强制显示红 Collect $ + 送货动作锁住(🔒),钱清才放行。

═══════════════════════════════════════════
## BULK BAR (选中行后,深色 #221F20 出现)
`N selected · [12 MS · 3 BF · 8 Sofa 分类总数] | Assign logistic · Export · Print · Mark done · Clear`
- 这四个动作现有的都能用,不重做功能。Export/Print 只在这里,不放 header。

═══════════════════════════════════════════
## 危险区 (别踩坏,来自真实代码)
1. STATUS/STOCK/DUE 的 count + label 格式 → 改文案连 ~36 测试一起改。
2. 共享 readinessOf/stockMatchKey/STOCK_BUCKETS → 动了详情 Ready/Waiting 也坏。
3. row inline-edit(add remark/logistic_eta) + 整行点开详情两个点击目标,靠 stopPropagation 分开 → 改布局易破坏。

## Master sheet 栏位对照 (数据来源)
Ref=E · Region=F · Deadline=G · Before7Days=I · StockPendingETA=J · Core QTY=K · MS/BF/SOF=L ·
LogisticETA=O · Assign Logistic=C · StockLocation=Y · StockStatus=Z · StockETA=AA · PO=AF ·
Customer=AG · Balance=AM · MS/BF Storage=AN · Sofa Storage=AO · PayStatus=AP

## 待查
1. ⚠️ 自动建 "Contact customer" 任务的 cron 有没有真在跑?(代码有、另处标未建,冲突)→ 没跑会漏单,要查证。
