# RENTAL — MASTER

> **The only Rental document.** Overwritten when re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.**

---

# §1 · Overview

### MISSION
Rent-to-own furniture: an agreement is signed, approved on credit, billed monthly, and can be
settled early.

### WHAT IS ON SCREEN TODAY
`OperationRental.tsx` **356 lines** · a POS Rent-to-Own lane · a Finance **Rental Approver** tab
· a Rental Setting tab under Admin. *Measured 2026-08-05 from file sizes and the shipped card
records; **pages not read line by line.***

**Live scale: ONE agreement (`RA-1003`), 0 Stripe subscriptions.** Almost every rule below is
therefore proved by test and by rolled-back production transactions, **not by daily use.**

---

# §2 · Frozen rules

### THE AGREEMENT
- **Rent and outright purchase may NEVER share one order.** The rule lives in ONE module that
  the rail lock, the add guard, the totals and the submit branch all ask, so they cannot drift.
  The guard sits in the single funnel all four add-doors pass through. **A both-kinds cart
  reports RENTAL — the safe answer.**
- **Qty is fixed at 1.** One rented item = one agreement + one subscription + one tracked asset.
- **The monthly fee and the CONTRACT TOTAL are shown together.** *"RM59"* without
  *"× 84 = RM4,956"* is how people mis-buy credit.
- **An agreement is BORN signed.** The POS captured a signature and threw it away, so credit was
  approved against a record that only claimed one. Approve now refuses an unsigned agreement.
- **The wording is stored as ordered blocks with immutable versions**, and the agreement records
  which version it was signed against.

### THE CREDIT GATE
- **An agreement is born `pending_approval` and NOTHING is materialised until finance approves.**
  Before this, the sell RPC wrote the full billing schedule, allocated the asset and minted the
  service entitlement in the same breath — so a REJECTED application would have held phantom
  receivables, a reserved asset and unearned visits.
- **The gate is finance + principal, deliberately NARROWER than "internal"** — that would admit
  BD, and a BD sells these.
- **Free win:** the Stripe checkout route already required `active`, so no card can be charged
  before approval with zero API changes.

### THE MONEY
- **The calendar is the signup payment plus the 7th of every month**, N payments for an N-month
  term, and **approve REFUSES a schedule that does not sum to the contract value.**
- **`rental_billings` has exactly ONE writer.** A collected month is undeletable.
- **Stripe cannot express the rule directly** — so the signup month is a one-time line item, a
  trial carries the gap, trial end BECOMES the anchor, and the schedule runs term − 1.
- **A bounced card is recorded as an EVENT, never as a second writer** of the billing row, and
  it is idempotent **on Stripe's EVENT id** — Smart Retries fire a genuinely new event per
  attempt, so three refusals are three rows while one event delivered thrice is one.
- **Late interest: ACCRUED is derived, CHARGED is stored.** Interest grows daily, so a stored
  figure is wrong tomorrow.
- **A discounted settlement is REFUSED with the real figure**, never allocated by guess — 49% of
  a customer's penalty belongs to the supplier.
- **Settlement goes THROUGH the payment RPC per month**, so the split and the one-writer law
  both hold and each month genuinely was paid.

### THE ORDER
- **A rental produces a Sales Order**, or operations never see it: the unit was allocated while
  nothing told a warehouse to deliver.
- **The line is priced ZERO on purpose.** A rental order is a FULFILMENT document; retail price
  would overstate AR and contract value would double-count the billing schedule.
- **Credit approval replaces the 50% deposit** in the proceed gate.

### SUBSCRIPTION SERVICE, CLEANING AND UPGRADES — OWNER-RULED 2026-08-14

The future mattress Subscription owns the contract, enrolled model, tracked asset, monthly money,
term, included benefits and permitted changes. Its standard cleaning benefit is **three visits
per subscription year**, performed by an appointed third-party cleaning partner.

The objects remain separate:

- `rental_agreements` / Subscription owns what the customer contracted for.
- `service_entitlements` owns the three annual visit credits and their validity.
- `service_visits` owns each due/scheduled/completed cleaning appointment, assigned partner,
  result, before/after proof and customer acknowledgement.
- Service Case owns only an exception: missed/failed/poor cleaning, damage, complaint, disputed
  eligibility, partner conduct, repeated inability to arrange or another issue needing follow-up.

A routine cleaning request opens the customer's Subscription and books the next entitled Visit;
it does not open a Case. Completion consumes one visit only on accepted completion evidence, not
when an appointment is merely scheduled.

Extra cleaning is a paid top-up service: it creates a sale/payment and an additional entitlement,
then follows the same Visit engine. A move to a higher model is a governed Subscription Upgrade,
not a Service Case remedy: quote and acceptance → price/monthly-fee change → old-asset collection
→ new-asset Delivery Order → asset and contract history. If the request arose from a complaint,
the Case links to that Upgrade but does not own its money, asset movement or amended contract.

The future Subscription has its own Claim policy and does not inherit the current outright-sale
100-Day Trial or refund path.

---

# §3 · Approved Evolution

| What | Why it is not built |
|---|---|
| **The dunning ladder (Day 3 / 7 / 21)** | **BLOCKED with a named cause: no message-sending integration exists anywhere in the API.** The rungs cannot be built until one does. |
| **Pushing the penalty onto a Stripe invoice** | Ledger half shipped. Blocked: 0 of 1 agreements has a subscription, so the invoice-item path is unverifiable. Key it to the event so a retry cannot double-bill. |
| **A discount policy for early settlement** | Undecided how it spreads across N months and two payees. **A guess would short the supplier.** |
| **The archived signed PDF** | The signature is captured; the rendered agreement PDF has no writer yet. |
| **Store-side reading of agreements** | Needs a dealer-scoped RLS read. |
| **Interest as "per month or part thereof"** | The harsher reading is a one-line change in BOTH the shared function and its SQL mirror. Now that a button exists, it is worth an explicit ruling. |


---

# §4 · Mattress Subscription planning boundary — 2026-09-22

## Confirmed owner facts / direction — RULING, not full blueprint approval

Source: Jess's 2026-09-22 Subscription Module Blueprint PLAN instruction.

- Diglant is the mattress manufacturer and an investor in Carres. Carres has a monthly
  mattress quantity KPI and forecasts orders to Diglant in advance. Forecast purchasing,
  followed by allocation when customers sign, replaces per-customer shortage purchasing as
  the owner-approved primary supply model. Existing Purchasing approval/allocation law still applies.
- **OWNER-APPROVED TARGET / NOT BUILT — Jess, 2026-09-22:** advance procurement and customer
  Sales Orders are separate records arriving at different times. An approved Diglant PO may
  precede any customer SO. When a customer signs, their SO/Subscription uses existing eligible
  stock or evidenced PO supply first; only a verified uncovered requirement leads to additional
  procurement. No duplicate buy per new SO. Unfinished/unverified supply is expected supply,
  never represented as ready-to-deliver stock. This confirms the business boundary, not a
  forecast formula, automatic ordering, new allocation writer or full blueprint approval.
- Manufacturer lead time is 45 days. Carres assigns Logistics to collect at Diglant in Klang
  and deliver across Malaysia, including Sabah/Sarawak. The 45 days must not be treated as
  including final nationwide delivery. Calendar basis/start trigger still require supplier evidence.
- One Carres-issued Unit ID identifies each physical mattress; Diglant attaches those labels.
  A direct route must never fabricate a Carres warehouse receipt.
- Go-live starts empty. Early forecasts are manager-entered; automatic suggestions may begin
  only after three months of genuine sales, never imported/test transactions.
- The requested review scope is a fixed-day monthly proposal by model/size, manager revision
  with rationale/version, PDF for manual sending, and forecast/sold/picked-up comparison.
  This is authority to PLAN, not to enable scheduling, place orders or contact Diglant.
  PDF generation/download and opening WhatsApp are not evidence of sending.
- Finance is outside this planning mission. §§1–3's existing Rental law remains untouched;
  its rent-to-own commercial terms do not automatically govern the new mattress programme.
- **OWNER-APPROVED TARGET / NOT BUILT — Jess, 2026-09-23:** service starts only after the
  customer's actual receipt and acceptance of its proof; pickup and intermediate arrival do not
  start it. Subscription centrally shows contract, Unit, delivery progress, cleaning credits and
  history. Booking does not consume a cleaning visit; accepted completion does. Normal visits
  remain separate from Service Cases for complaints/failures. Upgrades track old-Unit recovery
  and new-Unit delivery independently; subscription end and physical recovery are separate facts.
  This approves that operational lifecycle, not billing timing, new commercial terms or all UI.

- **OWNER RULING — Jess, 2026-09-22, initial storage model APPROVED / NOT BUILT:**
  Diglant offered delivery to Carres warehouse or holding goods at its own premises for Carres
  to arrange Logistics pickup. Jess selects the second option initially: completed mattresses
  stay at Diglant Klang; Carres arranges pickup. No larger/new Carres warehouse is assumed.
  Demand volume, required warehouse size and suitable partners are not yet understood; avoid
  the upfront warehouse investment while learning the new business.
- **OWNER RULING — Jess, 2026-09-22:** NETS supports the legacy business and is also the
  short-term delivery choice for the new Diglant programme in Klang Valley. NETS is not the
  nationwide solution. Other regional partners, capacity and acceptable rates remain unknown;
  do not infer an appointment of HOUZS or another legacy partner for this new programme.
- Monthly KPI levels of 100 / 200 / 500 mattresses are growth scenarios, not measured sales,
  signed volume guarantees or triggers to lease warehouses. Jess needs actual volume and its
  regional distribution before selecting additional partners and negotiating volume/rates.
  Multiple logistics partners and possibly storage locations may be needed as the business grows;
  neither their identities, prices nor network design are approved by these scenarios.
- After approximately 3–6 months of actual operation, Jess will evaluate volume and logistics
  options before deciding whether to rent another location and manage storage. This is a review
  horizon, not an automatic warehouse move, lease commitment or scheduled reminder authorization.
  This confirms storage strategy only; §5 is law only where explicitly owner-approved.

The complete recommendation below remains subject to owner review. Earlier proposals in another
worktree/branch are unapproved context only; this file is the sole Rental/Subscription authority.

# §5 · RECOMMENDED CARRES SUBSCRIPTION BLUEPRINT — PROPOSAL / NOT LAW

**2026-09-22 · PLAN · 待 Jess 审阅 · NOT BUILT。** 本节是完整的业务建议，不是执行许可。
除 §4 明确列出的 owner facts 和下列既有 authority 外，本节所有规则、计算、日期、页面、
字段和操作均为 **RECOMMENDATION / PROPOSAL / NOT LAW**。不修改 §§1–3 的既有 Rental
商业规则，不把旧 rent-to-own 的期限、转拥有权、买断或收费条款移植到新计划。
Finance 不在此次讨论范围内。没有应用代码、Card、部署、生产数据或外部发送。

## 5.1 · Authority audit 与本次决策边界

**决策：** 用提前预测备货支持 Subscription，再通过现有订单、采购、Unit 和 Delivery
体系完成客户履约；预测不能变成另一套采购或库存账。

**FACT — 审计基线：** 安全 fetch 后 `origin/main = 340e5e007`，本工作区由该 SHA 起步。
已读 Constitution §4 → ERP Architecture §§1–3、6 → Rental §§1–3，再检查相邻 authority。
旧工作区仅只读；`01f48ba90`、`b4d2d71f2` 的提案不属于批准事实。
本节取代其作为本轮推荐的地位，不保留其中逐客户缺货采购、周报或 Finance 扩展方案。

| 分类 | 主证据 | 本轮结论 |
|---|---|---|
| RESOLVED FROM AUTHORITY | ERP Architecture §§1、3；Rental §2 | 独立合同所有权、订单履约、一个动作一个 owner；Purchase/Rental 不混单；已签文本保留版本 |
| RESOLVED FROM AUTHORITY | Purchasing §§5.6、6.2、9.2；Stock §§3–5 | 正式 PO 发出时产生 Unit ID；报告不能生 Unit；采购审批和额外备货规则不被预测绕过 |
| RESOLVED FROM AUTHORITY | Orders 月度需求／Forecast boundary（约 245–270 行）；COPY Sales Order footer | 当前批准的需求是已确认未交付需求；新预测不混入该表；SO Register 目前排除 Rental |
| RESOLVED FROM AUTHORITY | Delivery §§1.1、5.3、14.1 | 唯一交接链和倒排日期；传统业务东马经 HOUZS。新 Diglant 计划短期 NETS 负责 Klang Valley，其他地区伙伴未定，不自动继承 HOUZS 任命 |
| APPROVED TARGET / NOT BUILT | Rental §2；Service Subscription boundary；Guarantee Future Subscription；Purchasing §5.4 | 每年三次清洁、独立 Visit/Upgrade、独立 Claim 政策；外部目的地 Receiving 语义已有目标，不能声称已建成 |
| BUILT IN SOURCE / 本任务未生产验证 | `apps/api/src/routes/operation/orders.ts:354–364`；`supabase/migrations/0275_rental_makes_a_sales_order.sql:224–250`；`apps/web/src/pages/operation/OperationRental.tsx:1–80` | 已有 Rental→零金额履约 SO 链接、Rental 资产列表；总数查询仍排除 Rental。旧 `RU-` 展示不能成为床垫第二身份 |
| REAL GAP / CONTRADICTION | 上述规则与 §4 新方向 | 导航已由 2026-09-23 owner 裁定为 Outright Sales/Subscription 分开；具体创建流程、预测转采购去重、未提货 Unit 的未来供应关联、工厂起点交接和收货语义需要跨模块批准；不能假装现有 Ready Stock 已支持 |
| REAL GAP / UNKNOWN | Purchasing §5.7 与 §4；Delivery §14.1 | 45 天的日历及起算凭证未证实；现行 PO 日期是 Settings 的工作日且不加运输天数。不能直接把 45 天塞进该字段。初期 Diglant 留货已由 §4 owner ruling 确定；具体伙伴和留货执行条件仍需落实 |

**证据范围：** UI MASTER §§4.1–4.2、6.0、6.7–6.10，COPY 的 SO/Purchasing 词典，
01 tokens、02 components、03 patterns，Workspace §§2–3 和 Action Flow 约束本节 UI/Work。
不改另一任务的 SO 页面、Manual Purchase/PO 表单或模板。没有新建 Blueprint/MASTER 文件。
未找到独立现行 human ERP Blueprint；未进行新的认证 2990 操作或生产填充率测量。
历史文档里的 live 数量不代表今日业务，更不能训练预测。
排除 Finance 政策设计、外部账户／接口接通、制造排产细节、车辆优化；均非本次授权范围。

## 5.2 · 为什么改，借鉴什么

**当前 → 问题 → 改进 → 代价 → 建议：** 旧提案从客户签约后的缺货采购出发，等到订单
才启动 45 天生产，会使全国交付承诺过晚。改为按月提前备货、客户签约后连接已有供应及
合格 Unit。代价是积压和预测偏差，因此保留经理改量原因、真实库存覆盖和逐月复盘。
不把 KPI 当作销量事实，也不因为目标高就自动买满。

| 能力链：当前 Carres → 成熟系统启发 | KEEP / ADAPT / REJECT → Carres 落点与员工路径 |
|---|---|
| 无已批准预测引擎 → Odoo MPS 按期间录入需求、建议补货、人工调整 | ADAPT：Subscription 管理月度预测；经理审阅后链接 Purchasing；不用报告直接承诺采购 |
| Orders 已有实际需求 → Dynamics 365 用实际订单消耗预测 | ADAPT：签约需求取代相同范围的预测份额，不把两者相加；经理从数量钻取 SO/预测来源 |
| 现有 PO、Unit、Receiving → Odoo 分开供应交期与缓冲 | KEEP + ADAPT：保留各 owner；倒推全国路线，采购只消费需要的工厂可提货日期 |
| 已有清洁/服务目标 → 本仓库 Service/Guarantee authority | KEEP：Subscription 开 Visit；异常开 Case；物理换货走 Stock/Delivery；不造第二服务台 |
| 已有 Shared Work、Register、对象页 → 仓库内 2990 研究与共享 UI | KEEP：使用当前 Carres 模板，不复制另一套工作列表、库存余额或 Dashboard |
| 自动补货、自动外发、预测单当生产指令 | REJECT：本轮只推荐自动生成内部草案，经理审阅，正式采购仍走唯一门 |

**外部 FACT，2026-09-22 查阅：**
[Odoo MPS 官方源码](https://raw.githubusercontent.com/odoo/documentation/19.0/content/applications/inventory_and_mrp/manufacturing/workflows/use_mps.rst)
提供按期间预测、补货建议和手动改量；同时警示与另一补货规则叠加会重复补货。
[Microsoft forecast reduction](https://learn.microsoft.com/en-us/dynamics365/supply-chain/master-planning/reduction-keys)
说明实际交易如何消耗对应期间的预测。
[Odoo lead times 官方源码](https://raw.githubusercontent.com/odoo/documentation/19.0/content/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/lead_times.rst)
分开交期和缓冲。Odoo HTML 直读超时，改读官方同版本文档源码；未声称进入产品实测。
这些只证明能力模式，不批准 Carres 的公式、日期或供货条款。

## 5.3 · 全链路与所有权

```text
Monthly KPI + manager forecast (model / size / region / sales month)
           |
           v
Stock + open PO + confirmed demand + route dates
           |
           v
Versioned proposal -> manager review -> Forecast PDF -> manual send evidence
           |                             (planning only, not a PO)
           v
Purchasing request -> existing approval -> official PO -> Carres Unit IDs
           |
           v
Diglant production -> attach Unit labels -> confirmed ready at Klang
           |
           +--> Diglant Klang holds completed goods [OWNER CONFIRMED]
           |
Customer signs -> shared SO + linked Subscription -> supply / eligible Unit allocation
           |
           v
Carres assigns Logistics -> exact pickup -> confirmed regional partner route -> customer receipt proof
           |
           v
Subscription service activation -> cleaning / changes / recovery -> closure
```

Subscription owns target/forecast versions、合同及服务有效事实；Purchasing owns request、PO、
供应回复及正式承诺；Stock owns Unit、条件、位置、持有人和可用性；Sales Order owns 该订单
的确切 Unit 选择/绑定/释放，Stock 执行资格检查。Delivery owns Logistics、路线和交付证据。
Receiving owns 真实接收与 GRN。各页只读摘要／跳往 owner，不跨模块添加第二编辑器。

## 5.4 · 六种数量，绝不混为一栏

| 事实 | 建议定义、时间及来源 |
|---|---|
| KPI target | 管理层给某销售月份的床垫目标；独立于 forecast，可按型号/尺寸分解，未分解差额明确显示 |
| Sales forecast | 经理预计该月能卖出的净新床垫数；初期手输，不能等同 KPI 或订单；记录理由/版本 |
| Actual sold | 建议用真实有效新客户承诺的床垫数，按确认销售日期归月；签约、取消、更正有来源。排除测试、草案、换货、维修、借用、纯换升级物流；扩购新增床垫另有明确分类 |
| Confirmed demand | 已生效 SO 仍欠客户的床垫，按客户需要的履约日期规划；是 Orders 的量，不等于销售月份销量 |
| Ordered, not picked up | 有效正式 PO 尚未发生初次 Diglant 实物交接的 Unit/数量；分生产中、已完成未提、日期未知；报告草案和 MPR 不是该数量 |
| Actual picked up | Diglant 实际交给获指派 Logistics 的床垫，按实际初次提货日期计；单位证据去重。退回、再次提取单列，不再次算首次提货 |

经理所见「预计销量（KPI）」拆为邻接的 KPI 与 forecast 两栏，避免混淆愿望和判断。
默认业务范围为新床垫 Subscription；Purchase 床垫另列，合并时同一床垫只计一次。
Diglant 全体供应池若同时覆盖两种业务，供给计算必须扣除 Purchase 等其他用途已占用部分；
不能因为报表筛选 Subscription 就忽略其他承诺。尚未知的 KPI 产品/渠道范围明示在版本里。

上月实际 = 报告生成月份的上一完整自然月（例如十月报告的九月），并直接打印年月，
不误写成目标销售月的上一月。销量显示原始确认、已生效取消和净数；月结快照保留，
迟到更正带更正记录，不改旧 PDF。实际客户收到数作为第四个履约观察量，不能替代 sold。

## 5.5 · 每月提案、冷启动和版本

**建议固定每月 10 日 09:00（Asia/Kuala_Lumpur）生成内部草案**，遇假期仍可生成，审阅
期限用公司工作日历。日期是待审建议，不是已设定自动化。首次上线当天可人工建首份，
之后固定日生成；错过生成保留失败/待重试，同一期间不会因重试产生另一份独立提案。

每次覆盖滚动至少三个月、并延长至最长实际路线所需期间；当前/近月缺口也显示，不能
只看两个月后。目标是十月上旬准备十二月销售，十月中旬争取完成沟通/采购，而非保证
所有十二月订单都能等到十月中旬才下单。已过倒推截止的需求列为风险，不能倒填发送日。

- 报告带生成日、数据截至时刻、销售目标月、预计履约/提货窗口、区域、型号/尺寸/SKU。
  历史销量取已完成月份；库存/PO/占用取此次 as-of 快照，并标记可读性和更新时间。
- 第一至第三个完整真实销售月：经理录入 forecast；数据不足显示未录入/不足，不能填零。
  输入预测与用现有覆盖计算建议采购量是两回事：早期也可算覆盖，但不得冒充历史预测。
- 满三个月真正上线经营数据后，建议开放按型号/尺寸最近三个完整月净销量的简单平均作为
  可解释基线，经理仍决定 forecast。完整经营月的真实零销量可保留；缺失月、新型号、
  断货期间或数据不完整不自动补零，不借其他型号数据伪造三个月历史。
- 三个月只是可开始建议的最低门槛，不足以声称季节性模型准确；活动、渠道变化、缺货
  压抑销量由经理注明。基线、经理值、差额、理由同存；KPI 不因算法改变。
- 生命周期：草案 → 待审 → 经理定稿 → PDF 已生成 → 人工发送声明／供应回复分别记录。
  经理改量必须留原值、新值、理由、actor/time/version；改日期/范围也出新版。
  定稿后改动不得覆盖旧版，保留一份当前有效版。复制只生新草案，不复制批准、发送或 PO。
- PDF 标明 `Forecast proposal — Not a Purchase Order`；文件内容依下列内外分工。
  同一提案身份与版本连接内部计算、对外 PDF、发送证据及后续采购，不建第二份手填数量。
  Diglant 只按正式采购承诺生产；forecast PDF 不能替代 PO 或批准新增生产。

**月度审量与外发内容 — PROPOSAL / NOT LAW（2026-09-22 收口建议）：**

| 事实 | 经理内部审阅 | Diglant forecast PDF |
|---|---|---|
| 期间和版本 | 生成日、as-of、销售目标月、版本、数据完整性 | 提案身份/版本、出具日、目标销售月、数据截至日 |
| 目标与判断 | KPI、经理 forecast、上月净 actual sold，分别标实际年月 | 型号/尺寸的预计销量；清楚标为预测，不是已下订单 |
| 现有供应 | 已下单未提分生产中/完成未提；PO/Unit 明细及占用/日期 | 相关已有 PO 与未提量作对账参考，明确不要求重复生产 |
| 新增量 | 系统建议、经理最终建议、差额理由、额外缓冲、已转申请份额 | 经理定稿的建议新增数量，标为待正式采购确认 |
| 时间 | 客户窗口、区域、路线倒排、最迟工厂可提日期与迟到风险 | 希望工厂可提货日期/分批窗口，请供应商回复能否满足 |
| 存放与交接 | Diglant 留厂、计划提货批次；区域/伙伴事实与未定项 | 成品留 Diglant Klang，Carres 安排提货；批次是计划，不是已确认物流预约 |
| 管理依据 | 真实地区货量、完整配送成本、履约表现、经理理由 | 不包含内部成本比较、员工资料或客户个人资料 |

经理依次检查：数据是否齐全 → 本月目标/预测与上月实际是否合理 → 已有供应是否真正
可用于该型号/日期 → 新增量和缓冲 → 对外日期是否可行 → 定稿。调整 forecast 会重算
建议量；直接调整最终新增量则显示差额及原因，不能回写销量、已有 PO 或 Unit 事实。
未录 forecast、覆盖来源读取失败、数量无法对账时不定稿为可供采购转换的建议；
供应日期待回复可保留明确标注的沟通草案，不伪装成确定交期。

例：同一期间、型号、可达日期下，待满足量 100，已有有效可覆盖供应 30，建议新增 70。
这 70 若已进入一个尚未发 PO 的申请，重新生成报告仍显示「建议新增 70、申请中 70、
尚未转申请 0」；不能因它还不是 PO 就再创建 70。之后其中 40 成为正式 PO，则显示
「新增缺口 30、申请中未发 PO 30、尚未转申请 0」。每段都读同源 lineage，不能把整个
原申请 70 再加上已发 PO 40。示例不改变 §5.6 的实际需求消耗/跨期间规则。

- 员工真正手动发送后记录准确版本、收件人/渠道、时间和证据。发送声明≠供应商收到/接受。
  下载、打开 WhatsApp、生成 PDF 均不关闭发送 Work。回复另存内容、日期、附证据。
  若 Diglant 表示已把预测当生产指令，标为承诺风险交 Purchasing 核实，不再发一张重复订单。

## 5.6 · 建议订货量：先消耗预测，再净算覆盖

**建议算法是业务口径，不是新库存引擎。** 按同 SKU、范围、需求日期和区域可达性逐期
匹配，所有覆盖取 Stock/Purchasing 的唯一来源；月底总量够，不代表月初来得及。

```text
Remaining new-sales forecast = max(manager full-month forecast - matched net sales, 0)
Planning demand = confirmed unfulfilled customer demand
                + remaining forecast translated into dated fulfilment needs
                + separately evidenced replacement / other authorised physical needs
Eligible coverage = unique supply matched to that same demand and required date
Suggested additional buy = max(planning demand + explicit buffer - eligible coverage, 0)
```

销售预测月份与送货月份必须分开：已卖掉的量先消耗其销售月 forecast，再将尚欠客户
部分按真实交付日期进入 confirmed demand。未卖出的 forecast 用经理可见的区域/预计
交付窗口假设映射，不把所有十二月销售都假装十二月一日交付；假设不明时不能给确定日期。
更早月份未交客户需求仍保留；超过 forecast 的真实订单全量保留，不能截成 KPI。

覆盖按唯一 PO line/Unit lineage 分为互斥位置：工厂未提、运输中、实际收到的合格库存。
同一 Unit 从 PO 到提货再到收货只是移动桶，不新增供应。已交客户不再覆盖新需求。
已绑定本计算内客户的 Unit/PO 只抵该客户需求；其他客户/用途已占用的供应排除。
损坏、隔离、退货待检、取消/作废、未知及来不及的供应不作为及时可用覆盖。
已下单未提总量照实显示，但只有可在需要日期前到达、条件相符的部分参与及时覆盖。
未知日期显示不确定覆盖和风险范围，经理确认前不把缺证据当必须再买全部。

**示例，仅说明算法：** 十二月 forecast 100，已确认销售 30，其中交付 10、尚欠 20。
剩余预测 70；本次需求 90。可及时匹配的供应共 50（已绑给上述 20 的也在此 50 内），
无另设缓冲则建议再买 40。不能再加一次 30，也不能把同一已收 Unit 同时算 PO 和现货。
若 50 中有 10 来不及，则显示「总量缺 40、及时缺 50、10 延迟供应」，先评估改运/改期，
不自动再下 50 而忽略未来积压。

安全量初期建议显式为 0，经理可增加并说明原因；运输时间缓冲与数量缓冲是两回事。
MOQ/整批限制只有供应条款证据存在才取整，显示额外量；不能暗设供应商最小数量。
前一期间结余向后滚动一次，后月不能再次使用已被前月占用的同一供应。

**转采购边界：** 定稿数字是「已经净算后的新增量」。建议通过现有 Manual Purchase
`Ready Stock` 的额外备货申请进入审批，关联 forecast/version/line；该申请不可再减一次
现有库存（Purchasing §9.2 的额外备货规则）。这只是共享来源衔接提案，不改其表单。
经理批准 forecast ≠ Purchasing 批准申请。已有 MPR/PO 覆盖的份额禁止再次转换；增加
只转未转差额，减少先交采购判断未发/已发承诺，不能由报告撤 PO、释放 Unit。
未正式下单的 MPR 不冒充 PO 覆盖，但明确列为「处理中」，锁住同源重复转换；若申请被
退回或撤回，保留关联并重新核算，不悄悄再生一份。定稿、转申请、发 PO 前都重验版本
及覆盖。并发/重复点击不生第二申请或 PO。

**OWNER-APPROVED TARGET / NOT BUILT — 客户后来签约，2026-09-22：** 提前 PO 与客户 SO
分开进入，提前 PO 不必已有客户；SO/Subscription 后来进入时先核对已有库存和已下 PO
供应，只有经核实的不足部分才追加采购。同一 forecast PO 覆盖的需求不能由 SO Batch
再买一次。尚在生产或未核实可交付的床垫只显示预计供应，不冒充 Ready Stock。

**PROPOSAL / NOT LAW — 具体衔接：** 先关联有来源的 forecast-stock 供应，再按资格绑定
实际 Unit。已收合格现货走既有精确 Unit 门；未提货/未收货用预计供应关联而非现货
reservation。批准的去重业务目标不代表该关联能力已建成；其具体衔接和 SO 剩余需求
计算仍须遵守 Purchasing/Orders/Stock 的唯一来源、资格检查和既有审批规则。


### 客户 SO 进入后的供应处理 — APPROVED TARGET / NOT BUILT, 2026-09-22

**OWNER RULING — Jess 确认五种供应情况及下一步处理：** 把「有没有供应」「实物在哪里/是否可提」「是否赶得上客户日期」分开判断。
依据 Stock §4 的现货资格、Purchasing 的 PO 来源及 Delivery 唯一日期计算；不修改现货
门槛，不另造库存余额。下面是业务情景，不是已批准的屏幕状态词或新的 UI 分组。

| 实际情况 | 员工处理 | 采购与日期后果 |
|---|---|---|
| 已有合格可用 Unit | 通过现有资格检查绑定该 SO line；安排真实提货/送货 | 不再买；交付日期仍需路线、容量及适用放行条件支持，不能承诺当天送 |
| Diglant 已完成、仍在厂 | 核实 PO/Unit、型号尺寸、可提时间、标签/条件及其他订单占用；记录该客户的供应关联 | 不重复买；可先安排提货准备，但厂家说完成不等于已验收现货。工厂交接/检查结果才支持后续实物事实 |
| 已有 PO、尚在生产 | 关联对应可覆盖份额、厂家回复及预计可提日；跟进生产并倒排交付 | 不重复买；预计日期不是确认送货日期，45 天只涉及制造 |
| 供应真正不足 | 展示已覆盖量和净缺口，采购只处理缺口并走现有审批 | 既有申请中数量也要核对，防止第二次申请；客户日期按追加供应实际可行性评估 |
| 来源/数量/日期读不到或尚未核实 | 保留已知供应，给所属负责人核实事实 | 显示未知，不能当缺货再买，也不能当有货承诺 |

**OWNER-APPROVED：** 一张 SO 可同时有几种情况，按床垫/订单行分别处理，不用一个
头部状态覆盖全部。数量够但赶不上客户日期属于交期风险；先检查其他可用供应或与客户
确认可行日期，不能自动再买一批。供应不足须扣除已有覆盖和申请中的数量；未知先核实。

**其余衔接细节 — PROPOSAL / NOT LAW：** 同一型号仍在厂的一张 Unit 不能关联给两名客户；有来源的预计供应关联也必须检查
未占用份额，不能因为尚不是 Ready Stock 就无限承诺。它是待批准的跨模块能力，不是
另一个现货 reservation writer。

先满足同型号/尺寸、资格及实际需要日期，不能只按「先签约」机械分配而忽略已经承诺
给其他客户的 Unit。签约不自动抢占别人的供应；改配需走有记录的受影响订单变更。
若数量够但日期赶不上，列为日期风险，先核实其他未占用合格供应或与客户协商可行日期；
不能自动把时间风险当数量缺口再买一批。换型号也需要客户接受，不能静默替换。

可提前准备物流安排，不把准备当实际提货；全国地区伙伴/时效未确定时，承诺保留为待
核实，不把 NETS 的 Klang Valley 服务套到外州/东马。部分交付须符合既有订单范围与
客户约定；每张实际接收证明独立，不能因送到一张就把全部激活。

**Falsifier：** 实际工厂检查/交接流程或拥有权证据证明某批货已经满足经批准的 Stock
资格，则按该真实资格处理；单纯厂家完成声明不会推翻现货规则。若现有 canonical
采购关联已完整支持上述预计供应分配，则复用它，不新建平行记录。此处不声称已验证该能力。


## 5.7 · 45 天与全国物流日期

**FACT：** 45 天是制造提前期，不包括最终全国配送。**UNKNOWN：** calendar/working days、
正式有效起算事件及工厂闭厂日。保留 45 这个 owner 数字，同时必须由采购取得供货证据，
未证实不能承诺客户。Purchasing §5.7 的正式 PO 日期规则保持原位，不把运输加进该日期。

```text
Customer receipt date / forecast fulfilment window
  <- final delivery + access / appointment constraints
  <- Sabah/Sarawak arrival + selected partner onward window
  <- sea departure / cutoff + port and partner handling + contingency
  <- actual Klang pickup slot + inspection / label readiness
  <- Diglant factory-ready date
  <- 45-day production on evidenced calendar / start event
  <- PO approval / communication time before that event
```

西马：按实际地区、伙伴提货/派送工作日及容量倒排，Klang Valley 与外州不能共用一个
随意写死的运输天数。东马：仍需覆盖海运、港口、中转及末程，以实际选定伙伴提供的
窗口/确认资料规划，不假装 Carres 调度其内部船次。Delivery §14.1 的 HOUZS 是传统
业务既有规则，不代表本轮已任命 HOUZS 承接 Diglant；短期 Klang Valley 使用 NETS，这是本轮 owner 明确选择；不把其覆盖扩大到全国。
海运内部节点只作有来源的观察/预计，不凭猜测制造 DO、收货或每段完成记录。
新合作需落实每段交接、客户联系及最终证明责任；Carres 仍 owns Logistics assignment，
只有真实交接点、确切 Unit、有来源的伙伴回复和到货证明才形成履约事实。

**十二月例子：** 仅假设 45 为日历天且十月十五日当天正式起算，简单日期相加约到
十一月二十九日才生产完成；不是已确认承诺，起算含首日规则还会影响一天。
这对十二月一日几乎没有运输余量。东马/较早交付需要更早下单或事先可用库存。
所以建议十月十日是准备/审阅节点，真正采购截止按最早需要日期倒推；不能固定为
「每年十月十五日下单十二月全部没问题」。每月固定报告不能阻止截止更早时提前人工修订。

## 5.8 · Unit、提货与已确定的初期存放方式

Carres 在正式 PO 发出时产生永久 Unit ID，Diglant 按对应型号/尺寸贴标。打印/贴标
不证明生产完、收货、拥有权或可交付。标签缺失、重号、型号不符或破损走核查，不能
临时造一个新身份；重印同 ID，实体替换才新 ID，保留旧新关系。

提货证据须包含 PO line、Unit、产品/状态、地点 Diglant Klang、交出者、接收 Logistics、
实时时间/actor 和照片/签收。部分提货只移已交接 Units，其余留原状态；无证据不移库存。
实际经过 Carres 仓库才有该仓库 Receiving；直送不可先造 Carres GRN 再「送出」。
工厂起点的真实接收/检验、供应商交接与 GRN 边界需承接 Purchasing §5.4 的外部目的地
目标，尚不声称现有 warehouse-origin DO 已支持。拥有权与实际保管方分开，不凭 PO 或
Diglant 的投资关系推定拥有权转移。

**OWNER RULING / APPROVED / NOT BUILT — 2026-09-22：** 初期成品留在 Diglant Klang，
由 Carres 安排 Logistics 提货。Diglant 送到 Carres 仓库是其提供的另一选项，当前不采用；
不为这项新业务预设扩租仓库，也不虚构成品已进 Carres 仓。这里记录实际保管方，
不凭存放安排推定拥有权、免费存放、保险或无限留货期限。

**执行建议仍是 PROPOSAL / NOT LAW：** 按客户/路线合并提货；落实厂家留货期限、
Unit 清单/状态回报、核查条件、提货时段、损坏责任与实际合作伙伴。记录「生产完成、
在 Diglant、未提货」而不是「Carres 仓库现货」。这些细节不重开已决定的初期模式，
也不能被默认为 Diglant 已同意的条款。

**OWNER RULING：** 运营约 3–6 个月，掌握真实数量及合作条件后，再决定是否租另一处
场地并自管；不是届时自动搬仓。**建议复盘证据：** 每周平均/峰值留厂床垫数、型号尺寸
和包装占地、存放天数、提货频率/等待时间、各地区交付表现、破损及物流报价。若考虑
仓库，再根据真实堆放限制、周转空间及通道估算面积，不凭销量直接猜平方米。
留货/物流问题先走运营异常解决；转为自仓仍需 Jess 新决定，不能由指标自动触发租仓。

**OWNER RULING — 规模与伙伴选择：** 短期 NETS 配送 Klang Valley；扩张需要先弄清实际
货量，才能按量谈价、选择地区伙伴。100/200/500 张是 KPI 规模情景，不是当前销量，
也不代表单仓或 NETS 能承担全国配送。候选伙伴的实际能力、风险和可接受价格尚未知。

**OWNER-APPROVED TARGET / NOT BUILT — Jess “yes”, 2026-09-22：** 月报支持按量谈价，
除全国总量外必须看四项：各地区实际货量、每周可集中提货数量/频次、每张实际送达的
完整运输成本，以及等待/延误/破损/重送表现。用真实地区分布选择伙伴和谈量谈价；
100/200/500 张仍是情景，不是保量承诺。确认范围不包括未呈现的字段、公式、页面或
整个 Subscription 蓝图，也没有授权联系伙伴、租仓或启用自动化。

**RECOMMENDATION / PROPOSAL / NOT LAW — 上述批准目标的明细设计：** 月报除全国总量外，
按实际客户州属/地区列确认需求、实际配送、未交量、每周可集运张数、每单床垫数、
提货频率、所需交付窗口、失败/重送及破损。Klang Valley、西马其他地区、Sabah、Sarawak
分开看；预测地域占比标为假设，不能拿全国 KPI 向某地区伙伴保证货量。
允许先收集候选报价以了解市场，最终选择及量价承诺再按真实数据判断；不必等量到
500 张才开始了解，但本 PLAN 不联系任何伙伴或承诺最低量。

同口径比较候选伙伴的可服务地区、真实容量、Klang 工厂提货、集运/海运与末程责任、
时效、交接/签收证据、异常处理以及报价的适用数量和有效期。价格比较建议记录一张
实际送达床垫所需的全部物流报价组成：提货、干线/海运、末程、偏远/楼层、等待、重送
和暂存；只记有依据的报价/实际物流费用，不扩展 Finance 或另建结算账。
量不足的区域暴露最低批量和等待时间，不能以便宜干线价假装整程便宜。

建议用 100/200/500 张分别做区域分布与集运频率情景，显示运输成本、所需容量及
数据未知项，不为每档硬定仓库数量/面积。实际量集中可谈固定频次/量价，地区分散则
比较多伙伴组合；任何保量条款均须另行 owner 决定。运营复盘可持续更新，约 3–6 个月
的租仓评估仍保留；此处没有设提醒、自动换伙伴或启动市场联络。


## 5.9 · 客户、激活、服务、变更到结束

**OWNER-APPROVED TARGET / NOT BUILT — Jess，2026-09-23：** 客户实际接收且接收证明被
接受后，才开始该床垫的服务；提货、中转到货不算。Subscription 集中显示合同、Unit、
配送进度、清洁次数和历史。清洁预约不扣次数，完成且接受证明后才扣；日常清洁是 Visit，
投诉/失败等异常才进入 Service Case。升级分别追踪旧 Unit 回收与新 Unit 交付；结束订阅
与资产实际回收分别记录，单一「完成」不得把未完成义务一起关闭。
批准范围是上述业务能力和归属，不是具体布局、收费规则、合同条款或全部蓝图。

**以下未明确批准的细节仍为 PROPOSAL / NOT LAW：**

**OWNER-APPROVED TARGET / NOT BUILT — 导航，2026-09-23：** Portal 使用一个
`Sales Orders` 父入口，下设 `Outright Sales` 与 `Subscription`。后者进入本模块拥有的
客户流程；原 SO 列表/改单及 Monthly overview 属于 Outright Sales，订阅数量/报表独立。
`Purchase` 不用于普通销售导航名，避免与 Purchasing 混淆。替换旧独立 SO/legacy 菜单，
保留历史订单、文件、身份、权限和有效深链；不删除业务记录。此裁定来自 Sales Order
Review 02 的 owner 确认与提交 `47387909a`，取代本节的混合列表/入口提案；本次仅对齐
Subscription authority，不导入该任务的其他月报改动。共用父菜单不合并合同或计算。

合同另有身份/签名/版本，SO 承接履约；独立 Subscription 管理不以其他模块报表取代。
具体创建表单、字段与页面布局仍为提案，导航批准不等于批准整个新业务建设。

准备草案 → 客户接受有效版本并签署 → 满足现行适用授权/放行边界 → 匹配已备供应 →
精确 Unit/Delivery 履约 → 客户接收证据接受 → 开始该床垫服务（上述已批准目标）。
建议一床垫一个可独立追踪的订阅履约资产；多个床垫分别可证明接收和服务，不用 SO
头部完成一次性激活全部。现有 Rental `active` 字段不能当作已经送达的证据。

激活建议以实际客户接收日为准，证明晚审核不改成审核日；提货、伙伴收货、到港都不是
客户收到。失败、拒收或部分交付保留真实位置与后续 Work，不激活未接收资产。
服务激活条件已批准；实际日期锚点/晚审核处理仍是本段建议，不定义或修改账单开始日。

保留每年三次第三方清洁的批准目标，建议服务年从有效服务开始日锚定；预约不会耗尽
次数，接受完成证据才消耗。额外清洁沿用既有 entitlement 路径。日常 Visit 不开 Case，
失败/损坏/争议才交 Service。独立 Subscription Claim 条款须随有效计划版本确认，
不得继承普通销售 100-Day Trial。

升级需接受变更、旧 Unit 回收和新 Unit 交付各自有证据，保留两个实体历史；只完成一段
就显示未完义务。地址变更通过 SO，不能由订阅页改运输事实；跨西/东马重新核算路线。
取消、暂停、续期、到期处理、回收责任及允许条件须由新计划明确条款控制，未设置不得
推断允许或自动续期/转拥有权。这里只留能力和记录边界，不拟定旧商业条款的替代版本。

终止申请不等于资产收回；服务停止、回收中、实际回收和闭合异常分别可见。回收后按
真实接收/检查判定可否再用，不自动成 Ready Stock。丢失、污染、破损、无人接收按事实
开所属异常，不从下拉状态捏造回收、销毁或客户同意。已提交对象不破坏性删除；改单留
接受版本和所有下游影响。新计划条款未批准时，不允许以本蓝图直接开始销售。

## 5.10 · 页面、员工一天与权限

以下是 **IA/字段建议，尚未批准的 screen copy**；获批后才同步 COPY/共享 authority。
使用当前 Shell/Register/Object Detail，禁止新 UI guide；不声称已验证屏幕宽度。

```text
Sales Orders                   [owner-approved navigation]
  Outright Sales               -> existing order list / amendments / Monthly overview
  Subscription                 -> Subscription-owned customer journey
    Agreements                 -> Contract | Asset & Delivery | Visits | History
    Forecast proposals         -> Monthly object / manager review / PDF history
                               (inner destinations/layout remain proposals)
Reports
  Subscription quantities      -> Target / Forecast / Sold / Picked up / Received
Settings
  Subscription                 -> programme versions, forecast day, scope, buffer
Shared destinations
  Purchasing | Receiving | Inventory | Delivery | Service | My Work / Team Work
```

Agreement Register 建议按日期、Agreement No、Customer、Model/Size、服务状态、Unit、SO
排列；扩展只查看关联资产履约，工作进入对象页。Forecast Register 按生成日期、提案身份、
目标月、版本、审阅状态、发送事实排列；打开对象查看型号/尺寸矩阵和覆盖明细。
有一项 main action；不加顶端 KPI 卡、不把 owner/action 塞进事实列表。

Forecast 对象先读范围/日期/完整性，再读表：Model/Size → KPI → Forecast → 上月 actual
sold → Ordered not picked up → 及时合格覆盖 → Suggested new qty → Manager final qty →
必要提货日期。较宽明细可滚动/展开，不能靠等宽压缩。点数量进入原 SO/PO/Unit/提货证据。
对象编辑可采用左工作右外发 PDF 的共享 split；保存后的阅读不强制 split。
Filters 包含年月、型号/尺寸、区域、类型和有来源的状态；搜索可识别关联文档/Unit。
Export 是权限内数据；PDF 是固定版本文件，二者不是发送。批量导出可有，批量激活/批量
随意订货不加入。显示真实空、筛空、加载、失败、未知，不能把失败当 0。

早上员工从 My Work 进入缺确认/逾期提货/缺证明；经理固定日审预测；采购办理唯一请求
和 PO；操作员核查厂家完成与标签、安排 Logistics；伙伴交接后员工核对证据；客户到货
后核实激活和 Visit；下班前处理仍有明确结果未完成的例外。无需另一张手工 checklist。

经理负责预测审阅；Sales 负责客户合同/承诺；采购/收货按各自既有 Duty；物流和清洁伙伴
只提供获授权的自身执行证据。新 forecast Duty 作为建议通过 Staff & Duties 管理，不能
硬编码某人或另造 Subscription 名单。资格权限、正常 owner、Buddy、实际 actor 分开。

Work 建议接入：预测到审阅日→定稿版本；发送待确认→准确版本发送声明；供应逾期→
有凭证的新回复/处置；提货/交付缺证→该 owner 的有效证据；激活待核→已接受客户接收；
Visit 到期→接受完成；回收未完→真实回收结果。每项有稳定 occurrence、责任规则、日期、
完成事实和 deep link。Quick Rail/Calendar 读取这些日期，不自造另一套 deadline；没有
请求或例外时只显示事实，不造任务。未授权外部角色使用人工证据代录，不开生产账户。

## 5.11 · 月报与例外闭环

月度表并排：KPI、定稿 forecast、净 actual sold、actual picked up、customer received、
forecast error（actual minus forecast）、目标差额。零预测时百分比显示不适用，不除零。
保留最早对外定稿作为准确度基线和最新修订作运营对比，不能月底改 forecast 让它看似准确。

**两个视角必须分开：** 自然月看各项真实事件，反映实际工作量；forecast/PO 来源批次看
这批原计划什么时候提、实际提了多少和还欠多少。同月 picked up 可属于后月销售备货，
不能把 sold 与 picked up 的差直接叫损耗或销量达成率。模型、尺寸、销售类型、地区和
as-of 范围一致，每个合计能钻到底层；退回/重提/取消/修订单独解释。

| 异常 | 明确处理，不能发生的假结果 |
|---|---|
| 厂家延迟/减产/缺标签 | 更新供应证据及及时覆盖，重算风险交负责人；不另下重复 PO |
| 经理加量/降量或已发预测被替代 | 新版保留原因、旧 PDF、关联 MPR/PO；变更承诺交 Purchasing |
| 高销量超 forecast / 低销量积压 | 核实未覆盖需求后追加；下期减少建议或经批准调配，不自动撤供应承诺 |
| 同一床垫被两种业务需要 | 同一 Unit 资格/占用检查；冲突拒绝，不能让各模块各自 reserve |
| 部分提货/遗失/破损/错发 | 精确 Unit 分结果、现持有人保留、源记录报问题；不能把全 PO 标为完成 |
| 海运/伙伴延期或证明缺失 | 实际获指派伙伴记录回复/末程证据，Delivery 呈风险和后续日期；中转到货不激活 |
| 新型号/数据断档/读源失败 | 经理输入或暂缓定稿；未知不当零，自动建议不能瞎补 |
| 重试/多人改同一版本 | 旧版提交拒绝并重读；报告、采购转换、提货、激活各事实只记一次 |

Settings 只存经批准的计划版本、范围/单位、固定报告日、业务日历、forecast 方法和显式
缓冲；供应交期属 Purchasing，伙伴覆盖/日历/预计运输属 Delivery，产品身份属 Catalog。
历史版本冻结其使用的假设；修改 Settings 不改旧 PDF 或既有签名。导入只能准备有来源
草案，不能造三个月历史、签约、发送、提货或客户接收。

## 5.12 · 关键检验、取舍与待审状态

| RECOMMENDATION | 会推翻它的具体证据（falsifier） |
|---|---|
| 月 10 日、滚动至少三个月 | 实际最早海运 cutoff／45 天日历证明该窗口太晚，则提前并延长 horizon |
| 三个月均值作初始建议 | 真实月报显示缺货/活动严重偏置或误差持续超过经理可接受水平，则保持人工并另评方法 |
| 签约净销量消耗 forecast | owner 明确 KPI 以实际激活计，或签约生效口径不同，则修改 KPI/forecast 定义与桥接，不能偷偷换指标 |
| 预测净算一次再转额外备货 | 逐 Unit/PO 对账发现重复覆盖、日期不可达或其他业务占用，则阻止转换、修正唯一覆盖来源 |
| 提货批次与留货执行建议（初期留厂模式已确认） | 实际等待、积压或损坏证据要求调整批次/伙伴；是否租仓自管由约 3–6 个月复盘后的 owner 决定，不自动切换 |
| 接收日作服务日期／晚审核的日期处理（细节建议） | owner 审阅的新计划条款明确日期处理不同时，调整该细节；客户实际接收且证明被接受的激活条件已批准，不能凭旧 `active` 代码更改 |
| Subscription 内部页面/创建表单（细节建议） | 员工走查显示任务不可达或重复录入，则改其内部组成；Sales Orders → Outright Sales / Subscription 导航已批准，不恢复混合数量或重复订单真相 |

🔴 **与现行实现不一致：** Rental 排除和 Incoming 不能现货分配。修复建议已在 5.6/5.9
明确作为跨模块待审批边界，不能用单页改造绕过。
🟡 **新员工易混淆：** forecast/KPI/PO/提货/收到五种事实。修复为分栏、带月份、可追源。
🔴 **不能照当前能力直接执行：** 工厂起点收货/DO、时间口径与未来供应关联。修复为保留
真实来源、未知日期和禁止虚构收货；未来执行前需在 owning authority 收口。
🟡 **业务仍未定：** 新计划条款、Klang Valley 以外伙伴和留货执行条件；初期 Diglant 留货已确定。
不把其他政策空白伪装成免费取消、默认拥有权或可立即售卖。

**CURRENT MISSION — 2026-09-23 consolidated review:** 已批准的留厂/NETS、按真实区域量
谈物流、提前 PO 与后到 SO、五种供应处理、接收后服务/清洁/回收边界均不重问。
剩余运营建议一次审阅，引用上文唯一详细定义，不新增平行规则：

1. §§5.4–5.5：月 10 日内部草案、滚动至少三个月；前三个完整真实月经理录入，之后
   以三个月平均作可修改参考；KPI 与预测独立，完整数据不足不自动补零。
2. §§5.5–5.6：经理审阅来源/日期、改量留因留版；实际订单消耗相应预测，已有供应及
   申请去重；预测 PDF 人工发送，正式采购走既有门。制造 45 天和运输分别规划。
3. §§5.9–5.10：已批准 Sales Orders → Outright Sales / Subscription；待审的是 Subscription 内部组成，
   两个工作目的地为合同与预测提案；Report/Settings/Work 使用已有公共目的地。
   各模块保留唯一记录 owner，相关跳转不生第二表单。具体 screen copy/布局仍待 UI 审阅。
4. §§5.9–5.11：采用实际客户接收日作为服务日期，证据晚审核保留该日期；建议服务年
   以其为锚点。未完成交付不开始服务。此日期方案不批准/修改账单日期。
5. §§5.10–5.11：员工从共享 Work 处理审阅、供应日期、提货、交付证明和服务例外；
   月报对照原定 forecast/actual sold/actual picked up/customer received，保留地区与批次口径。

**明确依赖，不交给 owner 猜：** 45 天日历/起算、厂家留货执行条件及伙伴报价应取得
供应/物流事实；无证据保持未知。新计划合同条款须有独立有效批准，禁止从旧 Rental
推定。未具备这些事实，不宣称能够对所有地区承诺交期或直接销售上线。
**明确排除：** Finance 设计、租仓承诺、外部联络/保量承诺、自动发送/自动下单、实时
自动化、应用建设、Card、部署和生产数据更改；本次不触碰 SO 页面或 MPR/PO 表单模板。

这次整体审阅仅批准呈现的运营设计，不把未呈现的 UI 细节/条款或整份文档自动升为 law。
批准后按范围更新唯一 authority；有未知依赖的能力继续明确标记，不假称 READY。
当前全模块仍未达到 PLAN MISSION COMPLETE；不再让 owner 通过逐句 “yes” 才获得下一步。
