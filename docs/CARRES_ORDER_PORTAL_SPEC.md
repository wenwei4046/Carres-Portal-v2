# CARRES ORDER PORTAL — MASTER SPEC(唯一总规格)

> 唯一真相。冲突以本文件为准(UI-KIT.md / STATUS-STANDARD.md 是它的实现细则,
> 抵触处以本文件覆盖)。存档 2026-07-18。

## 0. 工作规则(⭐ 2026-07-18 扩充 — 新 chat 开场必读并照做)
1. **COO 级 critical international advisor**,先想清 solution 才建议;引用国际同行 pattern(Shopify/Linear/DHL 等)佐证,但结论要贴 Carres 的现实。
2. 我截图 → 你主动 **top-to-toe 列问题**(由上到下、标 🔴🟡 严重度),不等提醒、用脑;我抓到的问题先认,再给修法。
3. 每个 proposal 给 **3 个 option**(画图/mock 也 3 个,可用临时 HTML mock 开在 preview 里给我挑),**标注你推荐哪个+为什么**;我回一个字母你才动手。
4. 华语回,English 技术词保留;我说"primary student"就用白话+生意比喻重讲。
5. 我 agree 才给 code/下一步;**已拍板的决定不准翻案**(除非我自己开口)。
6. **不 deploy 除非我说**;deploy 前必查 `git log HEAD..origin/main`(空才能出,phase-11 教训)+ dist 扫 SERVICE_ROLE;web/API 有配对依赖要一起出。
7. **动手前查 memory + 本 SPEC**——之前拍板过的格式/词汇/数据教训都在里面,别重新发明(rev9 没查 v3 把 MacBook 弄爆就是反例)。
8. **提 UI 之前先查数据填充率**(SQL 数一下),空字段不上桌;引用数字讲话。
9. 每个 approved rev:改完 → tsc+lint+tests(16 个旧 fail 是基线,别追)→ **preview 实测截图证明** → commit+push → 同步更新本 SPEC + memory。宁可十几个小 commit,不要一个大的。
10. **词汇法**:一个概念一个词、用员工/AutoCount 的词(GRN 对,Book in 错);状态词≠动作词;颜色只讲四件事(蓝=selection·flame=action·绿琥珀红=status·其余黑灰白);"colour+icon+position, words last resort"。
11. MacBook(~1000px 内容宽)必须一屏看全为准;表格 table-fixed;别拉橡皮筋摊宽。
分支 feat/orders-drawer。1000 单/月,单一操作者 Jess,全外包。

## 1. 分层
页面 cream #F5F1EA;Panel 白 #FFFFFF + 1px 中性边框 #E5E7EB(冷灰,~#E4DECF 作废)浮在 cream 上;Section band cream ~#F1EFE8 在白卡内。cream 只用页面+标题带,绝不 cream 叠 cream。任何地方不用彩色/红色边框。

## 2. 颜色纪律
flame #C44D2B = 一页一颗 hero。黑 #111827 = 只 order id badge。红 = 只 danger(红数字/逾期文字/真告警)。按钮一律灰系。颜色只在 状态文字/pill/dial/一颗 flame。

## 3. 字体/尺寸(SIZING LAW,final 2026-07-18)
Inter;Mono(SKU/id/号码);数字 tabular。
图标 3 档 **14/16/18,stroke 2**(17/1.75 是笔误,作废)。
文字:**13 body · 12 caption/meta/pill · 11 micro/label**。删 10(改用 11);12 保留不迁移。lint RULE D 放行 11/12/13。
金额:**18 mono hero · 13 tabular row**,只此两档(20/16/15/12 全删,覆盖早前 Balance 的 15/12)。
行高:**list 40 · panel/KV 36 · Items 产品行 52**(缩图+两行,豁免 36 规则)。删 44/56。
radius 卡12·控件6·chip8·pill full。

## 4. 按钮(灰系)
hero flame(一页一颗)· primary 黑(内联表单)· secondary 白+灰边+ink · ghost 透明灰 · danger 白底红字。
Reminder = ghost + 灰 bell。Chase = secondary(白+灰边+ink 字)+ WhatsApp 图标红(只图标红,不整颗红)。逾期强调靠状态文字/值(红),按钮不变色。无绿按钮。KPI 图标中性灰。

## 5. 组件
只用 SectionCard/SectionBand(cream 带:chevron·LABEL·右值·可折叠)/Row。禁 hand-roll,class 名=契约禁改名。

## 6. 页面布局(LOCKED)
整页,desktop~1920 为准,panel 等高。
Header 裸条(无卡框无搜索):‹ Orders · #1101(mono 面包屑,黑 badge 只在 Customer)· 右:‹1of176› 上/下一单 + flag + ⋮(圆钮)。
左栏 260px 固定(可折叠56):顶 Customer 块常驻(头像+名粗 Title Case+黑#1101 badge+状态pill+电话/WhatsApp+区域;收起紧凑,点开看全址;铅笔内联编辑)。下 tab 栏:Items(默认)·Delivery·Balance·Storage·Loan·Activity(icon16+label13+右状态点/计数;active/hover 蓝#DBEAFE/#1E40AF;40px)。数量用计数、告警用红点。
右栏 flex:顶 3 KPI grid Balance1fr·Stock1.8fr·Delivery1fr 等高(中性灰分类图标+label+右 headline 值)。KPI/阶段点击→跳 tab。下 = tab 内容:表单/文字类内容 max~1000 左对齐(别字段甩两端);数据表(Items/Warehouse)用全宽 + 正式分列。

## 7. 无 KPI 区 + Chase Now(⭐ 2026-07-18 最终拍板 — rev15 已实现)
**最终形态(rev15,Jess):详情页顶部 NO KPI**——A2 三条 stepper(rev11-13)和 chip strip(rev14)同日先后否掉:两者都在复述 tab/Chase Now 已有的信息,还闹双色矛盾(amber "0/1 ready" 旁红 "SOF 0/1")。右栏 tab 内容直接顶到最上(Items 默认)。状态由三层承担,不再画第四层:
- **左栏 tab 行的红点/计数**(哪个 tab 有事);
- **Chase Now 面板**(追谁 + 跳 tab);
- **各 tab 内自己的 §8 状态词/dial**(Balance tab 的 dial/Overdue pill、Items 的 readiness、Delivery 的 overdue)。
- **Delivered = closed**(guardrail #2)保留:Items tab 红点/计数静音、Chase Now 只剩 owing customer。
- 阶段词(Placed→Confirmed→Paid 等,§8 词表)只活在各 tab 内。
- **Chase Now 面板**(左栏 260px,Customer 块下、tab 栏上,是面板不是 tab):逐行=**counterparty**(supplier 按 supplier 合并多 PO,AutoCount PO 经 `suppliers.cat_covered` 唯一覆盖才推名字/logistic/customer 只在 owing 时);红点 overdue 排顶、琥珀 attention;**红标事实行("2 POs · 14d late" / "not booked · 5d late"),名字保持 ink**;Manage▾(Remind/Chase,与 Items Manage▾ 同语言);**行点击=跳对应 tab**(supplier→Items·logistic→Delivery·customer→Balance);全空显 "Nothing to chase ✓";header 右侧灰 "chased Xh ago"(last_chased_at,API deploy 后生效)。
(以下为历史记录:A2 stepper 布局已被 rev14 chip strip 覆盖;阶段词/dial 语义仍有效:)

Balance:值=Outstanding(或 No total/Paid),**dial 贴在 headline 值旁**(小盘+值)。阶段 Placed→Confirmed→Paid。无款隐藏 Reminder/Chase。
Stock(1.8宽,按 category 拆):行=分类(Mattress/Bedframe/Sofa/Accessory)+N/M(绿全齐/琥珀部分/红逾期)+该类供应商状态+Chase;全齐=Ready✓;多供应商→Chase(N) popover 按 supplier 归组(PO 打头,逾期上)。**库存 dial 贴在 headline 值旁**(Stock 卡身是 category 行,没有阶段清单)。
Delivery:值=deadline(逾期红)。阶段 Assigned→Booked→Delivered,Booked 逾期未约=红 clock(不是叉)。Reminder+Chase。
顶部 STOCK=追供应商(货弄进来);Items tab=逐件 reserve(货配出去)。同数据两视角,不重复。

## 8. 状态图标标准
两类:填充圆盘 dial(Balance/Stock 连续比例)· checklist mark(Logistic 离散)。
Dial SVG:外圈 circle r12 stroke2.5,内扇形填真实比例,满态画勾。色:gray#9CA3AF/#F3F4F6·amber#EF9F27/#FAEEDA·red#E24B4A/#FCEBEB·green#639922/#EAF3DE(勾#3B6D11)。
Balance dial:Unpaid空→Deposit扇形→Overdue红→Paid勾(有开发票才加 Sent)。
Stock dial:No stock→Partial→Arriving→Delayed红→Ready勾。
Checklist mark(Logistic):Done=circle-check-filled绿·Waiting=clock琥珀·Blocked=alert-circle-filled红·Pending=circle灰空圈。
Dial 一律贴 KPI headline 值旁,不放在阶段行上。
阶段用词(全 portal 统一,list NEXT 对齐):Balance Placed下单→Confirmed确认单→Paid收齐(类别名=Balance 不用 Money);Stock PO raised→ETA set→Goods ready;Logistic Assigned→Booked(partner 已联系客人并约好 slot)→Delivered。NEXT verb=完成当前 pending 阶段的动作(Order PO/Chase supplier/Book logistic/Chase logistic/Record payment/Confirm)。(“Record payment” verb 属 List 阶段 §14,详情页现阶段不加。)

## 9. Items ordered tab(⭐ 2026-07-18 rev18 — Jess 最终格式)
**六列 table-fixed:`STATUS · STOCK ETA · QTY · ITEM · PO · ARRIVED`**(alert-first,MacBook 一屏看全):
- **STATUS** pill:**Ready绿**("Reserved" 作废——跟 Received 撞脸)/Need N琥珀(**pill 可点=直接开 warehouse picker 锁货**)/On PO灰/Delayed红/No PO。
- **STOCK ETA**:晚于 deadline/无 ETA→红 alert;**点日期就地变输入框编辑**(只此一处,不再在展开行重复)。
- **ITEM**:chevron+名粗(**无 icon 缩图**,Jess),副行=size · SKU mono;**特殊多站 route 时名字下常驻 MiniStopsBar**(编号节点:站1实心=货现在的位置,后站灰圈,短站名 "Klang → AL";单站不画=无噪音)。
- **QTY** 纯数字(在 ITEM 前,Jess 指定顺序)。**PO**:In stock/PO####。
- **ARRIVED**(**"Received"/"Book in" 两词作废**——Received 与 Reserved 撞脸、Book in 是英式仓库行话):`n/m` 灰数字=到仓件数(状态);未齐时旁边 **[+ GRN]** 按钮(动作——**GRN 是 Jess 团队 AutoCount 里的正式单据词**;"+ Arrived" 会被读成状态)→ modal "GRN — goods arrived"(Arrived now 数量 · Condition · **Location dropdown**〔STOCK_LOCATIONS 去 at-supplier,自由文字会打错〕· DO# · Save GRN);部分到货天生支持(0/8→3/8→8/8 变黑粗体按钮消失);acc/service/无 PO → "—"。**词汇法:状态词 = Ready / Arrived n·m;动作词 = + GRN;死词 = Reserved · Received · Book in。**
- **Row 全白**——彩色只住 pill 和红日期(needs-action 蓝底 tint 作废,Jess:底色让表难读);点选中的行才蓝 wash。
**展开行(chevron)= 只剩 route chips**(goods-in 与 special handling 彻底分开):地点 icon+select 装 pill、chip 间 →、多站 🗑、圆 + 加站;零解释文字。**小单(≤5 行)平铺无组头**;>5 行按 category 分组(组头保留 "N need stock" 提示)。readiness pill 文案:全齐 "All ready ✓"·全无 "N needs stock"·混合 "x ready · y needs stock"(绝不以 0 开头)。ACTION 列作废(Reserve=Need pill 点击;Loan 在 Loan tab;Change route=chevron)。
Route 平时藏,chevron 展开一行:site→carrier→customer,单件特殊挂 special·direct 可编辑。
件多→按 category 分组(组图标+计数+"N need stock",needs-action 行蓝底,全 reserved 组自动收起);件少≤5 扁平。
Reserve 行内→warehouse picker 筛同 model+size→配好翻1/1+toast。Reserved 行 STATUS 绿,Action=—(绿勾不放 Action 列)。

## 10. Balance tab(发票式,内联无 modal)
左 Charges:编号1,2,3…行项(名·size·×qty…RM)+Storage fee 行(自动 not accruing=RM0)+Total(未设→内联 Set total)。
右 Payments+due:流水(缩图+类型+RM+日期·银行·ref+View slip)· Record payment=内联展开表单(不弹 modal):金额·日期·方式(Cash/Bank transfer/Cheque/e-wallet)·Bank(转账时出)·Ref·Upload receipt·Save/Cancel · Balance due(Total−Collected 红>0/绿Settled)+collect-by · Invoice/Receipt/Remind。
Generate invoice=左表+右实时预览+输出 PDF/Email/WhatsApp(点了才出)。收据 v-next 加 OCR 自动填。
数据:Total=货款+storage;Collected=付款和;Outstanding=Total−Collected;dial Unpaid/Deposit/Overdue/Paid。

## 11. Storage(费率 LOCKED;tab 定稿 rev21 2026-07-18)
费必须有 START+END,只算 START→END。START=deadline 之后下一个同星期几(周一1/1→START周一8/1);END=实际送出/收货。
费率:Mattress+Bedframe RM150/月;Sofa 免14天后 RM200。(RM5/day、RM14.30/day 作废。)
From–End 同一行;费用 roll 进 Balance 当一条 charge line。
**Tab 定稿(rev21)**:规则说明文字 = ⓘ rates tooltip,不摆卡(零解释文字法);chip "held Nd" 算到 END 停表(storage_to→logistic_eta→today),不永远数到今天;waiver+extension 收进 "› Waiver & extension" 折叠(有在用时自动展开);输入主面 = Storage?·From–End·Charge·Paid? 四件。切单时 tab 不存在(无 MS/BF/SOF)→ 自动落回 Items,不留白纸。

## 12. Delivery/物流(LOCKED — 调货引擎另开专门 chat;tab 定稿 rev21 2026-07-18)
**Delivery tab chip 真相阶梯(1A,Jess)**:Delivered ✓绿 › on hold红(balance/storage hold 第一次上 Delivery 面)› overdue红(过 deadline 未送)› booked <date>绿(logistic_eta)› not booked琥珀(有 carrier 没约,93% 常态,不准报忧)› no carrier灰。已送达永不告警(guardrail #2:chip+chase 行都闭嘴)。
**保存模型(2A)**:Delivery tab 全字段改了就存(sparse save + Saved toast),像 Excel cell;顶部 Save bar 与本 tab 无关。Time slot 字段撤下(0/162 死田,数据模型保留)。
**步骤布局(⭐ rev24 定稿,Jess Option A 合体 — rev23 的双栏 rail+band 作废:两套词逼人连线,乱)**:
- **一栏一套词:进度线就是步骤头,格子长在自己那步下面**(max-w 700)。节点语法 = journey card 同款(Jess 拍板样本):**done=墨色✓·当前唯一有色节点〔红=马上做/琥珀=等别人;单已 overdue 时当前节点转红〕·未到=浅圈·走过的连接线变墨色**。
- 步骤:`✓ 1 Assign logistic · you`(Logistic+Apply 建议;**Customer deadline 只读** "auto · AutoCount"——import 的 New-Delivery-Date 所有权归 import;**Postponed?** = 一次性 0196 extension〔快照原日期、动 storage、第二次要 principal〕,已延显示 "→ 新日期 (postponed)")→ `2 Stock ready n/m · read-only — work in Items`(标题带 n/m;正文一行各类目 n/m+status,与 Items 同一 stockCats;"open Items ›" 跳 Items;guardrail:Delivery 永不加 stock 动作)→ `3 Call customer · NETS — keyed by us for now`(步骤头右挂 **Remind(ghost+bell)/ Chase(box+message-circle)** → copyChase logistic + last_chased_at 章;正文:collect RM 提示〔与 Balance 同一 balanceDue,无 total 不显钱〕· Logistic ETA〔NETS 回报,今代填〕· Customer confirmed 手动勾 · "if not booked, chase by 日期 · −Nd" 输入)→ `4 Delivered`(光秃——overdue 只住 header)。
- **Header(rev25)= 阶梯 chip 在前(overdue 带天数 "overdue 9d")+ deadline 日期在后、永远墨色**(红只住 badge 里;不写 "deadline" 字)。状态全 portal 只画一次(有 extension 时 inline "(postponed)" 不画——下面 extension 行已讲)。
- **rev25 五律**:①字段 = 固定宽小盒(CELL_FIT:select 240px·date 170px),禁橡皮筋摊宽;②Customer confirmed 勾 UI 撤下(Jess:我们不标记;0220 列保留);③日期法:所有显示日期 = **"31 Jul 26"**(notes 戳带年份、去星期尾巴);④催人闹钟一句话 "if not booked, auto-reminder 9 Jul 26 · −3d auto"(0197 cron 自动生成 task,不用按;−Nd 点了才展开改,0/162 改过);⑤延期链:Postponed? 只在未用时显示。
- **NOTES(非阶段,线下方自己一节)**:自动盖日期流水,append 进原 customer_request 列(一行一条最新在上,零 migration,list tooltip/导出照读);客人随口改期进这里,别烧 Postponed。
- 与左栏 journey card(WHERE THIS ORDER IS,整单 4 步)是两个 zoom:journey=整单钱货送,本 tab 时间线=送货内部;同一节点语法。
**工具教训(rev22)**:根 tsconfig 是 references-only,`npx tsc --noEmit` 在 apps/web 是橡皮图章——真闸门 = `tsc -p tsconfig.app.json`(或 `tsc -b`);rev22 起体检用真闸门。
**Multi-leg(3A)**:入口收进 ⋮ "Multi-leg route…";有 delivery_stops 时区块自动显示;DeliveryChain 组件重刷等调货引擎 chat。
Sites:Carres 仓(Aman Perdana Klang,default 收货)·NETS(仓+物流,~97%,来 Klang 收再送)·AL(Sungai Buloh)·HOUZS(Balakong)·NF(Nice Future 床垫供应商)。
地区:Klang Valley 首选 NETS 备 HOUZS/AL;外坡/东海岸 首选 AL 备 HOUZS。
AL 不来 Klang:货在 Klang→Carres 直送 AL 一趟(不经 HOUZS);货在 HOUZS→AL 去 HOUZS 收;货在供应商→供应商直送 AL(最省)。避免让 AL 的货进 Klang。
进仓:NF 不送货→HOUZS 顺路帮收回 HOUZS,或 Carres 用 NETS 取;其他供应商直送该单集货 hub。
集货 hub 按 carrier 选:NETS 单→Klang;AL 单→AL/HOUZS。客户一次收齐。
Carrier=清单(NETS/HOUZS/AL/TEOW/TT/…+Self-collect);阶段随 carrier 变(送货 Assigned→Booked→Delivered;自取 Ready to collect→Collected 不追 partner)。
主数据驱动:Supplier master 存进仓规矩(pickup/delivers to);Carrier master 存出仓规矩(collects from Klang?/不来 Klang)。Route 自动算=supplier规矩+货site+carrier规矩。
国际做法:指派 carrier 当下系统算好方案+早预警(如 AL 不来 Klang/会双趟),给建议你确认。系统记规矩,不丢表让人算。未来 NETS 用 partner-scoped 视图。

## 13. WhatsApp 模板
客户面:多行友好、不催、永不放送货日期(logistic 直接约;客人问就给 logistic 联系方式)。「Hi {salutation}」不硬猜 Mr/Ms。Reminder+Chase 两语气,copy 模板(v-next wa.me 直发+存号)。
Reminder:Hi {salutation},\nJust a friendly reminder regarding your order.\n\nREF: {ref}\nOutstanding: RM {outstanding}\nItem: {items}\n\nDo let us know once arranged. Thank you!
Chase:Hi {salutation},\nFollowing up on your order — the balance below is still outstanding.\n\nREF: {ref}\nOutstanding: RM {outstanding}\nItem: {items}\n\nKindly arrange payment so we can proceed. Thank you!
Partner 面:supplier PO 打头、logistic REF 打头,永不出现 SO。多单 bulk 按 counterparty 归组,一 counterparty 一条,去重 last_chased_at。

## 14. List 页(drawer 收完才做)
顶部不加 KPI box(facet Summary 已是聚合 KPI)。每行=三线点(钱·货·送 绿/琥珀/红)+Next 文字。红只 danger,杀满屏 call now。facet 每数字可点=filter(At-risk=deadline≤3天或已过且某线未完;On-time)。选中=chip 可叠可清。Bulk bar:Chase 中性 inline;Assign logistic instant;Raise PO review(路线甲 consolidated→Klang池→reserve)。
**C rebuild 定稿(2026-07-18,Jess 挑 C,commit `04903cb`)**:六列 = Status 三线点(钱货送 8px 点,行内唯一颜色通道;灰=不适用)· Order(SO 粗 + Ref caption "+N")· Customer(名 + region caption,截断根治)· Stock(n/m 粗 + 灰副行 Ready/No PO/ETA d;10.5px→11 已清)· Delivery(partner + truth-ladder 词:Delivered ✓绿 / booked <date>绿 / not booked 灰字=常态 / — unassigned;**"call now" 死词下架**)· Deadline(热度 pill 只 open 单;**delivered 行灰日期无 pill = guardrail #2,含 regression test**)· Next(纯文字 12/600:红只 过期 Chase logistic + Order PO;Confirm 绿;Done 灰;info 蓝 pill 死)。行高 44→**40**;表头带冷灰 #F9FAFB + th 12/600 #374151(暖棕退役)。钱点 = ops_order_control.balance(>0 红即使 delivered;null 灰)。排序 slack 不变(货线红点=排序解释)。旧列 keys(orderId/ref/region/logistic)退役,旧 hidden-cols pref 无害 no-op。
**Staff auto-assign(2026-07-18 Jess 拍板 B,推翻 05-14 "不做分工"——换血后新人需要明确责任)**:每单一个 owner;新单自动派给最闲在职 operation 账号(只在进单时分,**绝不半路自动换人**);人人看全表(不加 RLS 隔离);任何人可一键改派;辞职=停用账号时一键平分/指定其手上 open 单;可选 "Rebalance now"(预览后执行)。统计中性 + 新人 ramp 标记(不比烂)。**BUILT(2026-07-18,commit `a0428a8`;migration 0232 已 apply prod——注意 wenwei 同日用掉 0230/0231,号要先查 prod)**:`ops_order_control.assigned_staff/by/at`(server 盖 by/at)+ `ops_staff_settings`(**opt-in pool**:有 row 才收自动派单——挡住 logistics@ 这类通用账号;`available=false` = away/MC,新单跳过;RLS 抄 ops_tasks operation+principal ALL)。API `GET/PUT /api/operation/staff`;shared `distributeOrders`(least-loaded,tie 按 userId 决定性)。Web:STAFF facet(pool 成员每人一行 tab + Unassigned,可点=chip)+ band 上 ⚙ Team popover(Add 入池 / away 勾 / **Shift N** 一键把某人 open 单摊给其他可用成员 / ✕ 出池)+ 每行 18px owner 初写字母 chip(点=改派 popover)+ **进单自动 sweep**(load 时把无主 open 单派给最闲可用成员;绝不动已有 owner)。**fails soft**:Worker 没有 staff route → 整层隐身(preview 已验)。**⚠️ 生效需 Worker deploy(deploy-gated §16);deploy 后 Jess 在 ⚙ 里把 Shasha/Ching/Chow Add 进 pool 才开闸。**Housekeeping:samantha@ 停用、Ching(7/19)+ Chow(8/1)账号要建(Principal → Accounts);**Jess 开自己的 jess@carres.com**(已预列管理层名单——共用 operation@ 让 audit 认不出人)。
**Round-3 定稿(2026-07-18,commits `9cf8e61`+`54ce1c7`;migration 0235 已 apply prod——wenwei 同日又用掉 0233/0234,号永远先查 prod)**:① Status 列 = **Option C**:全好→一个绿勾 ✓;有事才现该线图标(**RM$ 钱 · 箱子 货 · 卡车 送**,14px 状态色;匿名三点作废;delivered 全绿勾)。② **PIC 头像**:name 填称呼(可两个字,不 key 全名),字母 = **每个字取首字母、上限 2**(Shasha→SH · Khor Yee→KY · Li Ching→LC);每人固定专属色(调色板避开状态/action/selection 色);facet label 显完整称呼。③ **管理层专属**:`isOpsManager`(principal + operation@ + jess@)才能手动派/改/Shift/管 pool + 跑 sweep,web 藏 + API 403 双层;员工只读。④ **Presence(0235)**:OperationApp 开页 + 每 15min 心跳 `touch_last_seen`(DEFINER,self-only,anon revoked);available = pool + 非 away + **今天上过线(MYT)**——MC/没来 = 没心跳 = 自动跳过,零点击;facet 标 "· not in"/"· away"。⑤ Header 两行还原(round-3 纠错:面包屑+search/铃/help/⚙ 一行,Orders+Synced 一行——**删 title 行没被授权过,教训**)。⑥ No PIC 只数 open 单(delivered=结案不算没人看)。词汇:**No PIC / Clear PIC**(Unassigned 专属 logistic)。

## 14.5 Staff 分单制度(⭐ 2026-07-18 夜 四轮定稿 — 全部 LIVE,PR #188-194)
**总纲:开账号 = 入职,停账号 = 离职,中间全部自动;人分单,货合买。**
1. **自动入列(round-4)**:operation 员工账号**首次登录**自动进 pool + 即刻分单——开账号是唯一人工步骤。管理层(principal + `OPS_MANAGER_EMAILS`:operation@/jess@)永不被派单。Team 面板 ✕ Remove 已废(离职=停账号);未登录过的人显示 "joins on first login"(点击=提前分,可选)。
2. **即加即分(round-2)**:加入 pool 那一刻在全体非 away 成员间摊平,**不等登录**;登录戳只是情报("· not in")。
3. **全自动 MC(round-3)**:`countsAsInToday` — **10:00 MYT 前**人人保留份额(迟到≠缺席);10:00 起当天无 heartbeat = 自动当缺席,其**系统派的**单自动流给在场者;她登录即自动流回(半天 MC 自愈)。cutoff 常数 `OPS_DAY_CUTOFF_HOUR_MYT=10`(shared,一行可改)。away 勾只用于预知长假。
4. **公平摊平**:每次 sweep 把「系统派的(assigned_by NULL)+无主」open 单在在场成员间重摊(决定性算法,静默重跑零写入);**人手派的(assigned_by 有值)永不动**。手动改派/Shift/管 pool = 管理层专属(web 藏 + API 403)。
5. **机制**:heartbeat(OperationApp 开页+每 15min)→ `touch_last_seen`(0235 DEFINER,self-only);sweep = 任何 operation session 开 Orders 页触发 POST `/api/operation/staff/auto-assign`(server 算,防作弊)。数据:0232 `ops_order_control.assigned_staff/by/at` + `ops_staff_settings`;0235 peers-read policy + RPC。
6. **UI**:PIC 独立列(头像=称呼每字首字母≤2,每人固定专属色,避状态色);右侧人 tab chips(头像+数,与左栏 TEAM 同一 staffFilter);TEAM 段 ⚙ 面板。No PIC 只数 open。

## 14.6 集合开 PO + 值日制(拍板待建 — 下一刀)
**A 案**:bulk bar Raise PO → 全屏 review,**一个供应商一张卡**(行=SKU 汇总量+SO chips 标明为哪几张 SO;逐卡 Send/Skip)。**永不按 staff 分开开 PO**。**值日制**:一人管一个月自动轮(7月Shasha→8月Li Ching→9月Khor Yee;新人首月可跳过);TEAM 挂 "PO duty" 徽章;**周一/周四**系统自动开 ops_task 提醒值日者 + Orders 页横幅;**急单安全阀**:deadline 掉进备货窗(MS/BF 7天·sofa 5天)任何天亮红不等 PO day;Raise PO 按钮=值日者+管理层。需一张小表(如 ops_po_duty:month→user_id,月初自动接棒、管理层可改)→ **migration,号先查 prod tail**。

**Consolidated PO + PO 值日制(2026-07-18 深夜 Jess 拍板 A 案;BUILT 2026-07-19,migration 0236 已起草未 apply——等 Jess 过目)**:采购政策 **人分单,货合买**——PIC 管客人,PO 全公司合开,一人一个月值日自动轮(Jul Shasha → Aug Li Ching → Sep Khor Yee,seed 在 0236;之后按"服务月数最少者优先"自动轮,管理层可 override)。① **Raise PO**(bulk bar,值日者+管理层才能按;别人看到 disabled + "X's PO month";API 双层 403 `po_duty`,DB 没 0236 = 休眠不挡人)→ **Option A review**:一供应商一张卡(行 = SKU 汇总 + SO chips + RM cost;卡脚 To 仓库〔默认 Klang〕· ETA〔默认今天+备货窗〕· factory_pickup 要选 Pickup partner)逐卡 Skip/Send,一卡 = 一张 PO(POST /operation/pos,so_refs 带齐);排除项有交代(N lines already on a PO · stock 抵扣 earliest-SO-first · acc/service 跳过)。**supplier 解析三层**:catalog `product_skus.supplier_id` 权威(定死)> 操作员 override > category 唯一覆盖 = **猜测**(行内联下拉可改,改了行跳卡——prod 实况 cat_covered 只有 Ohana[bf,sofa]+NF[mattress],沙发全猜 Ohana 是错的,所以猜的必须可改);全解析不到 → Pick supplier 区。② **备货窗 = MS/BF 7d · sofa 5d**(`PO_STOCK_LEAD_DAYS`);deadline 掉进窗内且缺货 = urgent,任何天亮红("inside stock window" + banner 红条),不等 PO day。③ **Mon/Thu PO day**:每日 cron(09:00 MYT)逢一/四给值日者开 ops_task "PO day — N orders waiting stock"(幂等);Orders 顶 banner 只给值日者+管理层看。④ TEAM rail 值日者挂 "· PO duty" 后缀。API:GET/PUT `/api/operation/po-duty`(GET 懒填当月,PUT 管理层 override)。全链 fails soft。**注意 65 张 open AutoCount 单的 152 条 line 0% 对上 catalog**——shortage 全靠 client-side(order_lines vs stock_balances,`awaiting-stock-shortage` endpoint 只扫 in_production 用不上)。
scripts/check-design-standard.mjs(已落地 2026-07-18):RULE C icon∉{14,16,18} fail;RULE D text∉{11,12,13}+18 fail;RULE F 行高∉{36,40,52} fail;RULE E inline #F7F4EE fail(.kpi-box token 允许);RULE A raw hex ratchet;RULE G 手搓 section chrome fail。决策靠本文件+repo prototype 镜像,不靠聊天 quote。

## 16. DEPLOY-GATED(除非我说永不 deploy)
customer_confirmed + migration 0220/0221 + API + 收据 bucket。

## Build order
1. 详情页(feat/orders-drawer):布局✓·Items §9✓·Balance §10✓·Delivery §12✓·Storage §11✓(rev21 2026-07-18)·Loan 剩样式还债已清(功能照旧)。
2. 1B:⋮真动作·wa.me直发+存号·OCR收据·last_chased_at。 3. List §14。 4. Bulk bar。 5. AL 调货引擎(专门 chat)。
