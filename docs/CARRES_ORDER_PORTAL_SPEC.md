# CARRES ORDER PORTAL — MASTER SPEC(唯一总规格)

> 唯一真相。冲突以本文件为准(UI-KIT.md / STATUS-STANDARD.md 是它的实现细则,
> 抵触处以本文件覆盖)。存档 2026-07-18。

## 0. 工作规则
1. COO 级 critical advisor,先想清 solution 才建议。
2. 我截图 → 你主动 top-to-toe 列问题,不等提醒、用脑。
3. 每个 proposal 给 3 个 option(画图也 3 个)。
4. 华语回。 5. 我 agree 才给 code/下一步。 6. 不 deploy 除非我说。分支 feat/orders-drawer。1000 单/月,单一操作者 Jess,全外包。

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

## 11. Storage(费率 LOCKED)
费必须有 START+END,只算 START→END。START=deadline 之后下一个同星期几(周一1/1→START周一8/1);END=实际送出/收货。
费率:Mattress+Bedframe RM150/月;Sofa 免14天后 RM200。(RM5/day、RM14.30/day 作废。)
From–End 同一行;费用 roll 进 Balance 当一条 charge line。

## 12. Delivery/物流(LOCKED — 调货引擎另开专门 chat)
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

## 15. 防跳(机器强制)
scripts/check-design-standard.mjs(已落地 2026-07-18):RULE C icon∉{14,16,18} fail;RULE D text∉{11,12,13}+18 fail;RULE F 行高∉{36,40,52} fail;RULE E inline #F7F4EE fail(.kpi-box token 允许);RULE A raw hex ratchet;RULE G 手搓 section chrome fail。决策靠本文件+repo prototype 镜像,不靠聊天 quote。

## 16. DEPLOY-GATED(除非我说永不 deploy)
customer_confirmed + migration 0220/0221 + API + 收据 bucket。

## Build order
1. 详情页(feat/orders-drawer):布局✓·Items §9·KPI §7(Stock1.8+dial)·Balance §10·Delivery/Storage/Loan 待定稿。
2. 1B:⋮真动作·wa.me直发+存号·OCR收据·last_chased_at。 3. List §14。 4. Bulk bar。 5. AL 调货引擎(专门 chat)。
