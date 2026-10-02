# Recommended Carres Showroom Blueprint

2026-10-02 · Independent Re-audit · PLAN · **整体 PROPOSAL / NOT LAW，等待完整 owner review**

本稿替换原审阅稿，不是第二版经营权威。已批准局部规则继续有效；本稿推荐的新资产、公司购买、责任接缝及页面组合仍待审核。没有应用修改、Card、部署、生产写入、伙伴联系、账号开通或外部切换。**不声明 PLAN MISSION COMPLETE，不产生 READY scope。**

## 1 · 推荐经营模型：从现有实物开始，到实际结果结束

**RECOMMENDATION：每个获授权 showroom 有一个当前展示品视图。员工选择已经摆着的商品，说明需要清洁、维修、零件、更换、退回或搬货；新展示品则从同一入口开始。Operation 在同一来源记录回应、方案、费用及执行。只有有依据的实际交接／结果改变当前展示事实。**

```text
已授权公司 + 地点 + 实际人员
  → 当前展示品（真实在场、已核对；来源与未核对项分开）
  → 选择原商品 / 申请新商品
  → 一次填写要求、说明、必要图片／视频及希望日期
  → Operation 两个 Carres 工作日内实质回应
  → 原 owner 确认方案、商业条件、费用／付款及执行范围
  → 需收费时，指定有权限的公司人员接受明确版本
  → 安排各自取货、送修、送回、零件或新货
  → 实际交接、检查及结果证据
  → 当前展示视图读取实际结果；未完成范围和受托保管继续可查
```

**INFERENCE：展示视图、申请视图与执行单不是三个新账。** 展示视图回答「这里实际有什么」；申请视图回答「已要求什么、现在到哪一步」；执行记录回答「到底做了什么」。当前物理位置、已接受方案、公司买方和付款不能靠同一个手选状态表示。

**Current → Problem → Better design → Trade-off → Recommendation：** 原稿把菜单放在前面，却没有解决 Dealer 货品从哪里来、返修期间谁持有、怎样回到原展示列表。推荐先建立来源／资产／交接的完整链，再给展示和申请两个不同用途的查找视图。代价是必须补齐客户资产与公司买方接缝；收益是选原货、一次报需求、同一记录跟进、实物不丢。**推翻条件：** 走查 §13 任一场景仍需重填商品／地址／证据，或同一货在两个地点同时算在场，则本推荐没有成立。

## 2 · 决策门：研究范围与证据等级

**决策：** 怎样让 Carres 自营和 Dealer 使用一个 Showroom 入口，完整追踪当前展示、申请、商业确认、服务及实际物理结果，又不生成第二仓库账。

**需要的证据：** 当前主线宪法／ERP ownership／UI／COPY；Purchasing display 与 CO／return；Stock identity、showroom、return／repair／transfer、opening；Service／Guarantee；Sales buyer、Payment／Finance、Delivery、Work／Calendar、People scope；Carres 路由／预留源码；2990 原项目六条 consignment 路径和调拨；Houzs 对应路径及 ASSR；官方国际 ERP 的公司地点、客户资产、维修和两端调拨。

**排除：** 制造 MRP 内部计算、完整 GL／税制设计、路线优化、自营车队、其他模块的无关历史和 Cards。它们不决定本次资产／来源／现场身份；公司发票或正式财务文件仍须由其 owner 做合规验证，本稿不提供税务／法律结论。真实现场数量、原始历史交易、live 权限／数据未在本次测量，不用进口测试数据推业务规模。

| 标记 | 本稿的含义 |
|---|---|
| FACT | 有本次读取的权威、源码或官方来源；文件位置见 §15 |
| INFERENCE | 从证据推导，不能冒充 live 验证 |
| RECOMMENDATION | 完整推荐但未获本次整体批准；边界／推翻条件见 §14 |
| UNKNOWN | 现场／live／合同或完整行为未获证实；不得写为已建或已批准 |

### 四向 authority resolution

| 分类 | 已确认范围 | 接下来怎样处理 |
|---|---|---|
| RESOLVED FROM AUTHORITY | 公司／地点／账号／实际人分别记录；授权地点不扩权；统一 Showroom 入口；原终端客户销售渠道保留；Dealer 买货、无寄售；自营买入／supplier display 两条来源 | 全部保留，不重问 |
| RESOLVED FROM AUTHORITY | 原商品／行动／解释及必要 media 一次报入；Operation 同记录接续；两个 Carres 工作日实质首次回应；正常生产 lead time；进度依据真实 source；收费方案先接受 | 作为本方案约束，不再次申请批准 |
| APPROVED TARGET / NOT BUILT | Display Request／CO／CRTN，多段且部分交接；showroom scans／Count／Sites 部分能力；Dealer display Case；自营 Showroom Ready Stock 新入口 | 没有代码不等于新业务问题；按拥有模块交付 |
| BUILT / VERIFIED，有限 | 主线源码有 dealer/outlet/customer 区分、Stock Unit ownership、永久 ID／quantity 区分、exact-line 原子预留及 Receiving／Inventory 基础；模块记录有既往生产验证 | 本次只验证源码存在／文档记载；未重新证明 live 或整条 Showroom 链 |
| REAL GAP / CONTRADICTION | Dealer 公司自购不是 dealerId 客户 SO；Dealer current display／客户资产及受托保管未完成；opening source verification；首次回应的非 SO owner contract；最终页面／copy | 本稿给完整推荐；不能把字段存在写为业务已支持 |
| REAL GAP / CONTRADICTION | Stock §§5、12.9 等仍写 supplier display sale／Sold to Settle，而 Purchasing §7.7 已禁止出售；旧菜单写法与最新统一入口尚未完成全域收口 | 批准后在各 owning MASTER 删除旧现行规则，保留历史交易证据；不执行生产 backfill |

**FACT：没有 Showroom module MASTER。** 当前 display 经营规则主要在 Purchasing §§9.8–9.13，物理规则在 Stock，Dealer service 新裁决在 Service，统一入口在 ERP Architecture 分支。此稿是整合审阅材料，不能替代上述权威。

## 3 · 两类货，用同一种操作语言，保留不同权威

| 范围 | 货品身份／来源 | 在展示视图如何出现 | 不能发生的事 |
|---|---|---|---|
| Carres 买入展示品 | 原 PO／Receiving／Stock Unit 或 quantity；Carres Owned | 读取同一 Stock 的真实 showroom Site、condition、reservation、最后核对 | 再建 showroom balance；保留 display 就强制不可售；浏览就预留 |
| Supplier-owned 自营展示品 | 原 CO／Receiving／Stock；Supplier Consignment，指定 supplier | 同一 Site 的展示品，明确 supplier owner 和原 source | 客户 sale／sale notice／展示即 payable；因地点改 owner |
| Dealer 已购展示品 | **建议客户资产模型**：Dealer 公司、原 Sales／交付／原 Unit／serial（有则保留）、当前展示地点和观察证据 | 展示视图读取资产事实；不是 Carres Inventory，也不进 HQ available balance | 登记 Dealer showroom 为 Carres Site；Dealer goods 塞进 Carres Owned／Supplier Consignment enum |
| Dealer 货返修／受托保管 | 同一客户资产 + Case + 实际取送／保管事实；仓库托管时 Stock/Receiving 接物理证据 | 当前展示默认不算仍在现场；可查「服务／在外」及最后 holder | 返修收货重买一次、重开可售 Unit、付款或 Case 完成就改货权 |

**RECOMMENDATION：Dealer 展示资产由 Service 的客户资产事实负责。** Showroom 是其授权、按地点的读视图。资产记录保存「谁拥有、是什么、购买来源、最后证实在哪里、何时核对」；不保存 Carres available qty、库存成本或第二套收出数量。Dealer 自行确认现场观察需保留 actor/time；与 Carres 交接证据冲突时显示待核对，不能覆盖已发生 custody。客户资产可以关联原永久 Unit ID，但它不会因此作为 Dealer 现有 stock 行加入 Carres Unit Register；Stock §12.9 的 Dealer 非 Carres stock 边界保留。

返修进入 Carres／partner 时，**建议扩展现有客户返回／repair 的受托保管契约**，以原资产身份连接 Stock 的实际 handler／Site／handover 证据。它是外部货保管事实，不能参与 Carres stock valuation、replenishment、Ready Stock 或 reservation。不得假称当前两种 ownership 已支持它，也不以「记零成本」伪装 owned stock。原客户交付和资产 history 保留；回 showroom 仍是同一资产。不存在原 ID 时先有有区别的资产参考与照片，正式追踪身份按其 owner 规则补齐，绝不手造 U1。

**FACT，国际参考：** Dynamics 的 service object 可以用 serial 精确连接客户货品，也允许不作为 inventory item 的服务对象；其客户资产维护与收费连接是一个成熟模式。**ADAPT**资产／客户／服务／收费关联；**REJECT**把信用、项目账或维修汽车配置搬进 Carres。[Service objects](https://learn.microsoft.com/en-us/dynamics365/supply-chain/service-management/service-objects)、[Customer-owned asset maintenance](https://learn.microsoft.com/en-us/dynamics365/supply-chain/asset-management/integration-to-project-management-and-accounting/customer-billing)。

## 4 · 当前展示怎么建立：新交付、现有开场、每天核对

**RECOMMENDATION：没有原记录时不能「先填一张假采购单」。**

1. **新正式交付：** Carres 自营由唯一 Receiving／Site arrival 产生当前位置。Dealer 公司购买由真实交付验收连接公司资产和目的 showroom；订单提交、Invoice、付款、发出均不表示已摆在现场。
2. **已在 Carres showroom 的开场货：** 用 Stock 已 governed 的 opening/migration/count-correction 通道核对 physical goods、Catalog identity mode、source、owner、condition、Site／date/evidence。不要以新 PO／CO 冒充过去采购或到货；不是普通 Add stock 门。不猜旧日期。测试 PJ 36 行不证明真实 ownership／set composition，不在本稿修改。
3. **已在 Dealer showroom 的开场货：** 授权员工登记公司／地点、型号／配置、购买来源（已知就带入）、原 identity、照片／数量、观察人和观察时间。Operation 核对 Carres sale/delivery source；找不到时仍能报服务，但 ownership／entitlement 标为未核实。开场资产登记不追造交易、付款、发票、保证权益或 Warehouse receipt。
4. **精确货与 counted 货：** Catalog 已存 identity mode 为唯一答案；沙发组合保留成员／module 与整体的可读关系；只换一件就选其原 identity。互换配件按 SKU／quantity／source／site 实际数，不分配 Unit ID。观察到一套不等于一个 Unit，也不把截图中的件数当展示占地。
5. **未知／重复：** SKU 未补、label 不可读、来源／owner 未知，进入明确核对事项；可以记录观察和需求，但不能自动进入可售／可发出的正式范围。原 identity/source/site overlap 先匹配，登记重试不得生成第二资产。
6. **日常查验：** Carres 自营沿 Stock blind Count；Dealer 是授权资产现场核对，单独显示观察证据质量，不能算 Carres 月末库存。预计到货与预计离开只做计划；实际在场统计读 actual arrival/departure，历史保留。

**UNKNOWN：** 当前 Carres 原始展示清单的真实 source／owner、Dealer 现有型号与身份覆盖，以及旧商品购买条件。完整模型支持缺证据路径；不能把这些缺口通过自动 backfill「修好」。

## 5 · 一个 intake，所属记录不同，不多开一张沟通单

**RECOMMENDATION：Showroom 请求列表是来源投影，不是新 generic request ledger。** 表面统一输入／查找，系统按实际需求进入 canonical owner。员工不用先选 PO、Claim、Refund、Transfer 或 Case；Operation 不重录问题／图片／产品／地址。

| 员工要求 | 唯一主来源／沟通 owner | 后续连接 |
|---|---|---|
| 自营新 display、换陈列、撤下／搬移 | Purchasing 原 Display Request（保留已批准多段模型） | MPR/PO 或 CO/CRTN；Stock／Delivery |
| Dealer 新买 display | **建议 Sales 的公司买方订单／购买来源**，提交阶段仍未接受商业条件 | Sale／Payment／PO demand／Delivery／公司资产 |
| Dealer 清洁、维修、零件、产品问题、问题导致更换／退回 | 同一个 Service Case；不是 Case 外再开 Showroom service request | remedy／费用／Return／Repair／parts／Delivery |
| Dealer 只搬自己的既有货／非故障换款退回 | **建议复用 Display Request 的授权外部资产安排来源**；移动本身由 Delivery | 纯运输不强造投诉 Case；涉及商业换退则 Sales／Finance 授权 |
| 自营 display supplier product problem | Stock 原问题／Purchasing Claim，关联 display arrangement | 不因在 showroom 就强制客户 Case；涉及真实客户 remedy 时另连原 Case |

一个安排内可有多项货和不同处理；每项保存准确范围、拟议结果与剩余。**一个真实问题不拆成两份 complaint／沟通日志。** Display Request 与关联 Case 之间用原消息／附件引用和可见性投影；Case 是 complaint／remedy 唯一 writer，Display Request 读其结果。新的独立要求成为关联来源，旧 service 不复制 completed/paid/acceptance。

输入顺序：先确认公司／地点及被选商品 → 要做什么 → 解释／证据 → 期望日期与接收条件 → 显示已有相同货／问题的未完成来源 → 提交一次。内部 proxy 记录提出者、实际 recorder 和证据，不 impersonate Dealer／Sales。无 SKU／原单用稍后关联；scope 不明不能冒充另一家公司。

**首次回应责任建议：** 无 SO 的 Showroom intake first-response 由现有 Delivery Duty 经共享 resolver 承担协调，再把 commercial／supplier／service decision 和现场工作路由原 owner。此为该 Duty 对统一 intake 的**建议扩展**，不能把 Service Case Approver 当日常回应人；批准不会赋予报价、费用批准、维修或 custody 权限。有 Sales Order 的后续 routine Delivery 保留 PIC-first；供应商 PO/CO 留 PO Duty。全部实际 help 沿 Workspace；不新增 Showroom-local rotation。

## 6 · Operation 回应、方案、费用及沟通

**已批准：** 实质首次回应在提交后两个 Carres 工作日内；自动回执、打开记录、系统跳下一阶段不算。按 governed Office/Carres 日历由源时间计算，不另做 Showroom 日历。既有 Service 的其他 deadline／延期规则不被两日回应替换；新 display 生产也不是两日完成。

### 展示品订单日期与设置：OWNER-APPROVED 2026-10-02；尚未实现

Dealer 新购 display 按 Sales Order 的适用产品周期执行；对外显示商品、约定周期／已确认交付安排、需要对方处理的事项和重要日期变更，不必公开每个内部步骤。Operation 按期限执行，有条件就提前送。

Jess要求像 Sales Order／Purchasing 一样提供可维护的时间设置，也能手动调整单次请求的需要日期／优先程度，以便 Showroom 提早摆货销售。复用现有产品／供应商周期事实，不重复创建供应商 Production Days。单次调整与未来默认值分开；更早的需要日期不自动成为已确认供应商／交付承诺，仍需货源及原批准／放货条件成立。修改保留原因、操作人、时间及前后值。

**RECOMMENDATION / NOT LAW（设置细节）：** 在同一 governed Settings workspace 的 Showroom 范围维护展示订单时间默认值；原请求上调整需要日期及优先程度。具体字段、权限与 COPY 名称待完整 Blueprint 审核；没有批准修改通用两日服务回应期限。

**OWNER RULING — 2026-10-02 最新边界：** 下新购display订单遵循适用Sales Order规则和正常订单沟通，不另加Service进度流程。只有维修等非新购服务才需要另外的服务进度。若服务结果包含新购买，购买部分仍按订单规则执行，原服务结果以自己的证据完成。新增5／7／3日数值尚未批准，不能套到购买订单。

### 两日回应、五日检查、七日方案／进度：非新购服务 SOP 建议

**FACT，owner clarification/question 2026-10-02：** Dealer 新购 display 的生产周期与 Sales Order 相同，条件允许就提前交付；维修及其他服务要向 supplier／Sales 核实是否承保、怎样处理，不可能以两工作日作为完成承诺。Jess提出核实可能需要5–7工作日，并要求国际参考及SOP建议。这个提问不是批准新的5–7日规则。

**RECOMMENDATION / NOT LAW：** 在原已批准两日 first-response 外，补独立方案核实／沟通检查点。所有以下检查点从原提交时间按同一 Carres governed 工作日计算；不在第2日重新起算5–7日，内部等supplier／Sales不重置对外更新钟。

| 时间／里程碑 | Operation 必须完成的结果 | 不能冒充 |
|---|---|---|
| 提交立即 | 系统留下编号／提交时间／收到的商品证据；自动回执可告知两个工作日回应 | 已开始人工处理／已接受请求 |
| 两工作日内（已批准） | 人工检查来源／照片和缺口；需要时已向 supplier／Sales 发起核实并留证据；对Dealer/showroom解释正在查什么、还缺什么及下次更新日 | 已确定承保、收费、维修方案或完成 |
| 第5工作日（新增内部建议） | 检查supplier／Sales是否已答；缺答就催原责任人／升级，核对是否只缺报价、资格、parts或运输；记录所缺决定 | 自动替supplier判free／reject、给假完成日期 |
| 最迟第7工作日（新增对外更新承诺建议） | 能确定则给具体方案／provider／费用／payer及真实估计；不能确定则告知仍缺的具体答案、已采取行动、下一更新日期，并升级未答事项 | 不把「仍待supplier」算方案已确认；不承诺supplier一定七日答复 |
| 第7日之后尚待核实（新增建议） | 每最多3个工作日给有内容的更新，重要结果更早即通知；每条必须有下一更新时间与未解决责任 | 无限waiting、把generic模板当进度或偷偷重置年龄 |
| 方案已接受之后 | 根据实际provider／parts／production／transport确认执行日期，分别记录pickup／repair／return／actual completion | 接受费用、安排日、repair done和return delivered合成一个完成 |

**方案确认目标：** 资料足够的普通服务以5–7工作日完成核实并提供方案为内部目标；**对外可控硬承诺是最迟第7日给方案或明确进度，不是供应商必须完成确认**。Dealer缺证据也要在第2日说清具体缺项，保留等待对方时间与总年龄；第7日沟通仍需要发生。复杂／安全／严重损坏须立即依据原Service/Issue紧急规则升级，不等第5日。跨公司外部contact仍由获授权实际operation执行，本PLAN不发任何消息。

**新display购买与服务分开（OWNER-RULED）：** 新购买按适用Sales Order规则及原订单进度执行；goods/release/收货条件成立可以早送，不额外人为等待第5或第7日，不再加一套服务更新期限。上述新增5／7／3日建议仅供维修等非新购服务审核，仍未批准。既有两日request首次回应保持其原适用范围，不成为Sales Order新增阶段或完成期限。

**既有14工作日Service promise：适用范围核对，不能自动扩大。** 已检查 Service MASTER §1.1 Dealer purchased display service、§4 The deadline，以及 Guarantee MASTER 的交易／产品／条款版本 entitlement 规则。§4规定既有Service报告起14工作日及受控解释／延期；Dealer新增范围则包含 dirt、wear、paid cleaning，并明确同Case intake不等于免费保修。现行authority未明确这些新增Dealer交易是否全部继承14工作日完成承诺，故标为 **REAL GAP / CONTRADICTION：Dealer新增服务的完成期限适用范围待经营裁定**，不能只因使用Service Case而推定消费者承诺全部适用。

已有交易／服务条款确实适用的14工作日承诺继续保留，不重置、不因supplier等待默许暂停，并按原解释／延期规则处理。未明确适用的Dealer清洁／维修，核实provider、方案、费用及交易条款后确认完成安排；本稿不自行赋予或取消14日保证。第7日更新不能代替原本适用的完成义务，也不能作为结案证据。

**国际证据与Carres判断：** Salesforce官方将首次回应与最终解决设为不同milestones，并支持时间点预警／升级；Microsoft官方也将First Response和Resolve By分开，以businesshours／holidays计算，并提供可配置的暂停。它们没有给出家具维修通用的5–7工作日数值。**ADAPT**分开response／decision／execution及定期更新；**REJECT**直接照搬软件支持小时数、自动暂停supplier等待或承诺七日供应商答复。两工作日首次实质回应是已批准的Carres规则；新增5／7／3日检查点是未批准建议，各数值均不是国际家具统一标准。[Salesforce milestones](https://help.salesforce.com/s/articleView?id=service.sla_milestones_parent.htm&language=en_US&type=5)、[Salesforce first response and resolution](https://trailhead.salesforce.com/content/learn/projects/set-up-case-escalation-entitlements/create-entitlement-process)、[Microsoft SLA metrics](https://learn.microsoft.com/en-us/dynamics365/customer-service/administer/create-standard-sla)、[Microsoft business hours / hold](https://learn.microsoft.com/en-us/dynamics365/customer-service/use/customer-service-hub-user-guide-case-sla)。

**推翻条件：** 实际请求记录显示资料足够仍普遍无法七日给方案，检查supplier答复／报价／Sales决定分别耗时后调整内部目标；如果第7日后3日更新只产出重复空话，则改为有明确下一检查日的源工作，而不能取消对外沟通责任。尚无Carres请求样本分布，5/7/3不是经测量的表现。第一回应必须明确「还缺哪项证据／可行方案／谁处理哪一步」。后续消息、补图、安排变更、结果留同源actor/time/channel；电话／WhatsAppproxy保留是谁说的、谁记录的及依据。逾期firstresponse产生source-specificWorkoccurrence，补资料不抹掉首次逾期历史。

收费／免费都写清楚：处理哪些货、做什么、谁提供、free／charged、金额、payer、含哪些取送／零件、预计与已确认时间、方案版本。**已批准** charged proposal 在执行前由有权人员明确接受；已读、上传转账图、沉默、日期刊登均不是接受或已到账。费用改变／范围增加则明确差异，接受变更版本；未经接受部分不执行。不要默认公司每个地点人员都有接受费用权。

**RECOMMENDATION：** 未有更具体付款政策时沿有效交易条件与 canonical money/release rules，不设置任意新预付款比例、信用额度、免费 warranty、费用上限、house inspection 或 provider。原 approved claim/repair 文档 Issue exceptions 仍只适用于其自己场景，不能盖过 Dealer paid-service acceptance。费用可追溯到原 Case／公司来源；Finance/Payment 接收付款、credit/refund 事实，Showroom 不有第二钱包／balance。

共享 communication 分 audience：公司可见回复和已发布方案／进度；内部 investigation／supplier cost／个人 HR；指定 provider 的必要执行资料。跨部门引用原 evidence，不重新上传。media loading/failure、影片未处理、上传未成功分别显示，失败不等于 0 files。attachments 的 detail、thumbnail、download、PDF 和 export 都服从 scope，不只隐藏按钮。

Operation 可发布 preparing／ready／scheduling／confirmed sending-delivery／actual dispatched 等**含义**，但字段读取原 Stock/Delivery source。requested／estimated／confirmed／actual 各有自己的事实；撤回错误发布保留更正原因／历史，不删除旧沟通。确实未准备好时可解释原因，不把 publication 当 stock writer。

## 7 · 逐条完整经营旅程

### A. Dealer 公司购买新 display

**RECOMMENDATION：Dealer 公司是这笔 sale 的真实买方；原 terminal-customer 销售流程不变。**

Dealer 选授权公司／地点、Catalog configuration/quantity、希望时间 → Sales 将同源需求补成公司报价／商业订单，买方公司、billing party、ship-to showroom、实际 contact 分开 → 有权公司人员接受明确商品／售价／费用／交易条件版本 → 沿原正式 Sales issue/revision、需求覆盖／Stock exact binding → 缺货才进入 Carres Purchasing demand，不重复购买 → Payment 用同一公司销售 invoice allocation／receipt，不用 dealerId 当欠款 → 原 commercial/release gates 成立再 dispatch → 公司／地点实际验收 → 资产关联原销售／交付／identity，进入当前展示。

不填假个人 emergency／consumer signature 凑现有 form；公司接受人是真实人，company buyer 不是 login。公司购买款的 Outstanding 是此笔**买方公司销售**的应收，不是它替终端客户销售产生的 HQ→Dealer credit/debt。保留宪法「没有 Dealer credit」；本推荐不新增赊账、Dealer wallet 或自购佣金。未知价格不是零；未同意报价不是正式 confirmed order。公司交易适配 Sales／Payment/Finance 是**尚未 built 的边界**，不能称现有 Dealer SO 已 READY。

**建议经济边界：** 复用现行 customer-money collection/release 门槛，按已批准商业条件收款；不把另一终端客户款项抵这笔自购，不把 Dealer commission 自动抵扣 display 款，不承诺新特殊账期。需要改变这些经营条件时才单独 owner ruling。title/风险／price／return 的条件保留交易版本，本稿不自行推定所有权法律生效点。

### B. Carres 自营买入新 display

原 Display Request 带入需求、Sales negotiator／proxy evidence → 已有 MPR 审批 → PO official issue 和身份 → supplier commitment → 一次 Receiving 记录实收／condition → Stock 真实 Site/current display。已买 Hookka 等以后售给客户沿原 SO／exact reservation／Payment／Delivery，原 supplier purchase invoice/payable 不因客户 sale 再生成 supplier sale notice。

### C. 自营 supplier-owned placement／swap／return

同源已谈妥 arrangement → CO，unknown price 不阻 agreed consignment movement → 真正 receipt → supplier display。swap 连接新入、原货搬走、supplier pickup 各腿，已有的 same-supplier combined price-free CO instruction 保留，CRTN 有真实 old goods／remaining；不发第二套通知。实际进 warehouse 不是已交 supplier。未收旧货也不自动阻新 goods，空间与日期在真实接收条件中协调。

Dorsettloft 例：2990 → PJ 新 goods；PJ → Carres warehouse 原 old Units；warehouse → supplier 同一 old Units。2990 是已报告实际 pickup 地址，不默认 Carres Site。先核对有无正式先前 receipt；无则 PJ 首次 Receiving，有则原身份继续物理移交，不能再 fulfil PO 一次。supplier later stock visit 只是可能，不是确认预约。

### D. 清洁／维修／零件，原货不必离开 showroom

选原资产／Unit → 对应 Case（Dealer）或原 stock/repair source（自营） → evidence/eligibility → 具体 provider／scope／fee → 接受必要条件 → 现场服务或 parts 交付、使用的原 goods 身份及结果 → 效果证据和问题反馈。无取货就不生成 fake return。维修工时／parts 消耗留原 owner；已清洁不改变货权或自动新 warranty。parts 有可追踪 module 就单件关联，counted parts 沿数量 source；更换部件不会重造整张 sofa identity。

### E. 取回送修／送回，多次返修

同一 Case／授权 RO → 逐件 actual pickup、实际 provider／carrier → 仓库实际托管／check 或直接 supplier/repair partner → repair outcome／return readiness → actual return handover → showroom actual receipt/check → 原资产回到该地点，condition 和 repair history 连续。Dealer 货始终 Dealer-owned；供应商货保留 supplier owner。一次 repair completed 不是 return delivered；returned 不是可售。

再送修保留每一 round 的原出入、provider、日期及 proof；不覆写第一次。相同问题继续原 Case／既有 reopen rule，新的不相关问题按 Service 原 intake/duplicate policy关联，**不复制 Houzs「不同问题覆写原 complaint」**。本推荐不强制所有帮助都经过七阶段。

### F. partial replacement／换款／return

选准确旧 goods/模块与想要的新 goods，明确质量 remedy 或商业换款 → Service/Sales 原 decision、eligible／condition／差价／费用／payer → 有权接受 → 分开 old pickup、new delivery、parts 及 money consequences → 实际各范围写 evidence。原 set 只换一模块，则其他模块留原 showroom；新模块来源／identity 保留，不把整套先退再造。

旧货取回用于修理不等于 Carres 买回；公司退货意向不等于 accepted return／refund。只有 Sales／Service 已授权的商业接受及 Finance 记录才发生 money/title 后果，Stock 独立证实 physical。退款、credit note、实物返回、supplier recovery 四者互相链接而不互相假完成。拒收、condition 争议保留最后 holder；未解决范围继续可见。

### G. 跨地点搬货

Carres 控制 Site→Site 由原 Stock Transfer；保留 exact source、两端实际证据。Supplier-owned internal display 移动不改 owner；若现行 Available-only selector 排除了 governed supplier display／问题 goods，**是批准目标与 selector 接缝**，不能假 sale 或解除 issue 来搬货；需 owning contract 将授权非可售物理搬移与 sale eligibility 分开。

Dealer A 地点→该公司 B 地点是外部客户资产运输，Delivery 从同源安排，不是 Carres internal Transfer。actor 必须获相关范围授权；只获 A 的人可以提出希望 B 的运输，但不能自行看 B 全部货／接受 B 到货。Operation 核准目的 contact／scope/availability，收货人记录实到。第三公司交接先有有效授权／商业来源，不能默许跨公司 owner 变化。

发出后原地点不继续算 actual present；未到 B 时在外／carrier custody。部分搬 2/3，只动准确两件，第三件留 A。未计划的 redirect 保留原 handover 与获准新目的；取消不瞬移。

## 8 · 页面是上述工作结果，不是先选菜单

**RECOMMENDATION，整体 placement 未批准：**

```text
Showroom（已批准统一业务入口）
  当前展示品       地点实际货，默认 landing；从原商品开始求助
  申请与进度       canonical Display Request / Case / company purchase 来源投影
  Ready Stock      只给 Carres 自营；已批准读取同一 eligible Warehouse stock

原 Sales          terminal customers 的 Sales Orders 保留
Purchasing        自营采购及 supplier CO / CRTN 的原内部 writer／文件查找
Service Cases     同一 Case，原服务部门处理与查找
Warehouse         唯一 Inventory、Inbound/Outbound/Counts
Delivery          同一安排、carrier、actual handover/proof
Workspace         My Task / Team Work；不再加 Showroom Work home
Settings/Reports  原中央 home，Showroom scope deep-link
```

中文为审阅含义，不是新 on-screen COPY。Current Display、Requests 等英文未准入；旧原稿 Display/Requests 拼法不当既定 law。**建议新 literal copy 在整体审核后进入现有 COPY 同一次 governing persistence，不在此稿画假 live 控件。** 原 CO／CRTN full names 已获准，继续有效。

**为什么保留两个查找视图：** 有货需帮助先找 goods；已经提交要看回复则找 request。只做 request list 会逼员工从旧申请猜今天实物；只做 display 会遗漏新 goods、在修品及已离场但未结束申请。两个 population 不应伪装 Table/Cards 两种外观；各自 Register 内的 Table/Cards 才是同一 filtered result。

**Operation 与 Dealer 页面职责不同但 records 相同。** Dealer 只见授权公司／地点、对外 evidence／已发布方案／真实 dates／remaining；Operation 搜索授权全部来源并从 Work 进入原 owning action。source 类型可过滤，不要求员工理解不同单据。CO/CRTN 原内部 named door 保留，不放 Dealer 菜单，不泄 supplier cost。旧 Purchasing Display Requests 门若迁到统一 Showroom，保留 source 搜索／明确 deep-link而不再有独立 duplicate request register；**这是待整体批准的 placement replacement**，不靠本稿偷偷改变已批准导航。

### 默认内容与对象

| 页面 | 首屏需要的事实 | 操作含义 |
|---|---|---|
| 当前展示品 | Product/配置/图（有则）；exact identity 或 counted qty；Stock Location／真实确认地点；owner；condition；last verified；linked open source | 选准确 goods 求助；打开原商品／来源；核对 scope、现有问题不重复报 |
| 申请与进度 | source reference／提交日；公司／showroom；商品／所求帮助；实质 first response 日期／未回应事实；已发布 current progress；确认安排日；remaining | source reference 打开一个 owner object；不在 register 手选完成，不放万能 Work column |
| Ready Stock | 原 eligible Product/配置/condition/identity或数量、Warehouse/Stock Location、证据支持 earliest handover | 浏览不 reserve；Choose Ready Unit 回原 customer SO line，原子重查 |
| 商品／客户资产详情 | 原 identity/source/buyer/owner；当前 evidence；open request；service/movement/parts/history；缺证据 | 主数据／商业／Stock writer 不搬进 summary；打开 owning door |
| 申请／Case／公司订单详情 | identity/party/site/actor → 当前下一行动 → selected goods/evidence → accepted方案／回复 → 每段安排和actual scope → documents/history | 复用 full object；internal request 没有空 PDF；正式外发 document 用现有 review/preview grammar |

使用已接受 Shell/Register/Object template、kit Block、DataGrid、goods expansion、shared inputs/viewer/History。content 决定列宽；expand 仅做 selected goods 摘要，communication 进对象，不把第二 workspace 藏在一行。Rail 用有意义数量／time shortcuts，如当前在场、未核对和确认安排；不复制 Sales finance summary。未知／失败不显示零；loading／empty／no matches／no access 分开。stock planned incoming 不和 present 相加。phone／键盘／200% 用同一 kit，不另设 Showroom UI kit。

**本次没有 rendered mock／visual measurement，故上述是完整语义及 placement 推荐，不是已验证版面。** 新 kit gap 必须统一准入，不 inline 造组件；最终 on-screen copy 仍需与 COPY 合并审核。

## 9 · 员工一天的工作、Work 与 Calendar

早上：showroom 看原展示是否正确、需补证据／接受方案／接收哪些准确货；新 display 或现有问题从相应入口发一次。自营急客户单开 Ready Stock，选原 customer SO，之后仍等待 delivery/release 真实条件。

Operation 打开 My Task，先做到期实质 first response，再处理已接受但未安排、变更日期、缺 proof、部分未返还／未解决。Sales 处理本人的商业确认，PO Duty 处理供应商承诺，Delivery Duty 处理无 SO display transport，现场 handler 只做其实际扫描/签收。manager 在 Team Work 查 missing assignment／late/blocked source；不以「谁建申请」当所有后续责任。

收工：还有哪个 source 没有实质回复；哪个方案未接受；哪件仍在 carrier/provider／仓库受托保管；哪些 new-in 已到而 old-out 未走；哪个 promised date 已变；哪些 goods 未核对。结案不能埋掉这些。

| source obligation | completion fact | owner／date 边界 |
|---|---|---|
| first response | 对当前提交的 substantive response/evidence | §5 proposed existing Duty extension，shared resolver；两 governed工作日 |
| requested missing information | 原 source 收到指定事实 | company authorised actor／original Sales；不能 invent deadline |
| paid proposal acceptance | 有权公司 actor 接受明确版本 | company permissions；不当 Payment |
| supplier commitment／issue | 原 PO/CO issue/send/date reply evidence | PO Duty；现有 commercial rule |
| transport arrangement | carrier/contact/date/scope confirmed | SO PIC 或 approved no-SO Delivery Duty |
| pickup／receipt／check | handler own exact scope/proof accepted | Stock/Receiving/Delivery 的真实 permission |
| service outcome／customer confirmation | remedy/result + acknowledgment／required remaining obligations | Service 原 rule，费用／保管没完成不假结案 |

每 occurrence 保留 owner rule、source、trigger、completion、actual actor、governed date/calendar、permission与deep-link；没具备契约不假称已接 Work。Assigned to、Updated by、Completed by 分开。普通 authorised help 不重分配，也不 grant approval。

Calendar 只显示真实 dated arrangements，第一回应待办不算预约；Warehouse arrival/pickup 由 Warehouse count，service/Delivery 各自 source，不重复统计一趟腿。未日期显示治理规则的未定，不编日。Quick Rail Calendar/Customers/Activity 保留现有 scope；customer door 不能让 Dealer看到自己的终端客户以外资料或 HQ stock。service 会话不是 employee presence。

## 10 · permissions、media、documents、Settings／reports

授权维度为 company、具体 location、individual、action capability、audience；同一公司不自动 all-sites。公司名／地点本身不证明 actor 可以接受费用、确认到货、退货或看财务。公司购买 authorised commercial contact 与现场 receiver 分开；Carres Operation proxy 不伪造对方承认。

列表、search、detail、count、related source、media original／thumbnail、download、PDF、history、export 全覆盖。地址、公开产品图片和supplier quotation不是同一 visibility。文件/消息展示只投影可见原事实；Supplier/Logistics 获必要 goods、地点、contact、condition/proof；不获完整客户财务／内部成本／其他公司资料。

正式发票／收据、PO、CO、CRTN、Return／RO、DO／Service Note 沿原 owner。发布方案接受记录与正式 Invoice／付款各有作用；print/download 不等于 send/accept/dispatch。公司 invoice 买方和送达地址正确，旧地址／产品名变化不改历史 PDF。正式文件保留版号、recipient／sent evidence，缺旧 PDF 明说不重造。内部 asset opening 不发假采购／历史 Invoice。multi-leg manifest 是原范围投影，不制造 trip ledger。

Settings 用原中央公司／地点／联系人／user scope、Catalog configuration与identity mode、staff Duties／cover、provider／calendar、有效商业条款／服务证据／模板。**建议新增客户资产与公司 buying authority 字段在原 owner，不另做 Showroom settings home。** retire 地点／staff 只阻新工作，未完成 handover／service 需正式接续，不删除历史。PJ约11 sofa sets不建固定 capacity／自动receipt block。

Reports 按授权 company/site/source/action 查 current display 与 last verification、在外/受托保管、response deadline与substantive response、已接受方案／fees、actual vs confirmed dates、partial replacement、unreturned scope、provider/carrier/supplier结果。Carres stock、supplier display、Dealer asset 分 populations；不把 Dealer goods 计入 inventory value，不将 supplier display算可售，不让 abandoned请求提高完成率。金额读 Finance；credit note不算 cash refund。export携带来源、scope、generation time、unknowns，与正式 document batch不同。

## 11 · 完整生命周期与并发

| lifecycle | 推荐处理／原锁定边界 |
|---|---|
| Create / source / numbering | 从 selected goods或new需求进入原 owner；原正式编号体系保留；asset ref 不冒充 Unit／交易号 |
| Draft / submit | draft可以补unknown；submit需真实范围和actor；失败保留输入／状态未提交，不假receipt |
| Amend / version | 提交后的重要goods／fee／provider／date变化保留before/after/reason/actor；已接受方案与已issue历史不覆盖；仅改remaining scope |
| Copy | 新草稿重查company/site/availability/价目；不复制签收、actual、paid、acceptance、reservation、approval |
| Duplicate prevention | identity/source/company/action与open范围匹配；提示已有相关source；同一Case不硬按model+order合并不同问题；retry一次创建/收费/交接 |
| Concurrency | 提交/接受/安排/预留/actual custody 更新重查当前version／goods范围；第二人看到冲突并刷新，不覆盖第一人事实；资产与stock互有link不互写余额 |
| Partial | item/module/quantity/leg单独remaining；physical完成与commercial/comms结果分别闭合；新到2件不自动完成旧回3件 |
| Cancellation | 停未执行scope，理由／通知／owner权限保留；已paid退款原Finance，已pickup需真实返还／redirect，不能cancel→stock自动回流 |
| Correction / rollback | 错输入有controlled correction及evidence；已实际交接不由transaction rollback抹掉；撤销错误财务按原owner；未知last holder保留待核对 |
| Close / reopen | 主owner规则与required结果满足才闭合；在外物品／remaining return／unaccepted paid方案不能靠状态藏掉；新问题保留原history，不覆写原complaint |
| Search / selection / bulk / context | 按scope source/model/ID/date/site；跨site批量accept/dispatch有逐scope权限／version检查；没有安全业务bulk act就不为kit加checkbox |
| Completion / historical evidence | current display只读actual，ended/removed资产在history可找；old source/PDF/condition/provider/identity不消失 |

## 12 · ERP consequence pass：每个 owner 写自己的事实

| owner | 本次后果及边界 |
|---|---|
| ERP Architecture | Unified entry、company/site/actor分开；为Dealer asset/company buyer明确跨模块责任；覆盖旧菜单placement而不移transaction ownership |
| Sales Orders | terminal consumer保留；建议明确公司buyer、接受版本、商业换退、original/changedPDF、invoice obligation及demand／reservation；dealerId不当buyer proof |
| Purchasing | 自营MPR/PO/CO/CRTN、supplier commitment/RO/Claim；删除当前supplier display sale rule；Dealer自身买Carres不是Dealer Purchasing |
| Receiving / Stock | 一次正式新收；原identity；return/repair新visit；controlled transfer两端；non-sale movement与sale eligibility分离；Dealer asset outside Inventory，真实托管接缝待适配 |
| Delivery | source-linked非SOdisplay／customer asset运输；SO PIC/noSO Duty区别；每legactual proof；无fake SO／internal Dealer Transfer |
| Service / Guarantee | sameCase，客户资产建议；remote evidence/provider/feeaccept/remedy；不默认消费者paid Guarantee/100Day给Dealer display；source-specific policy snapshot |
| Payment / Finance | 公司sale/service付款source适配canonicalallocation；refund/credit/AP/valuation各自原owner；没有dealer credit、钱包、双balance |
| Workspace / Calendar | first-response Duty扩展待approve；各义务scope/date/completion；一source完成一occurrence；actual arrangements一次count |
| Catalog | storedidentity mode/model/module/configuration；缺SKU有in-contextdoor；不靠supplier／category猜exactness |
| People / Settings | individual/scopedcommercialreceiverauthority、sharedroster/cover；离职／locationretire保留history／工作交接 |
| Issue Tracker | process fault、wrongdelivery、loss／cost/recovery责任；不代Stock／Case／Claim；质量supplierproblem从independentsource开Claim |
| Rental | 不是display订阅方案；未来routinevisit仍原Entitlement/ServiceVisit，不强塞Case |

上述是同一ERP的record责任，不是多个重复用户旅程。未知CompanyInvoice/DealerCustody能力属于尚待批准／完成接缝，不移到Showroom做自建ledger。

## 13 · 端到端桌面走查：逻辑已检查，未执行 live

| 场景 | 当前展示如何变化 | 申请／商业／custody怎样保持真实 |
|---|---|---|
| Dealer 床褥污渍、现场清洁 | 原资产仍在原地点；condition/result更新 | chargedproposalaccepted后实际provider执行；无fake warehouse IN/OUT |
| 床架取回送修再送回 | 取走后不在present；在repair/outside可找；actualreturnreceipt才回原地点 | sameidentity/Dealerowner；各holder/round/proof；不进ReadyStock |
| 3件取走2件 | 准确2件离场，1件留现场 | 每件remaining与carrier/provider，整单不completed |
| Sofa set只换一个module | 未动成员留场，新moduleactualreceipt加入关系 | 原成员identity/history不消；钱／remedy／source独立 |
| Dealer两showroom搬货 | actualpickup后A少；Bactualreceipt才多 | company同一不是CarresTransfer；B授权/receiver明确；在途只一处 |
| 两人同时请求同一货 | 列表不因submit改变 | overlappingarrangement拒绝/匹配；不双取货、双fee、双reserve |
| 先新入、旧货尚未取 | 新goodsactual到场；oldgoods还在场 | space确认；outgoingremaining继续，不能整swapdone |
| 旧货已进warehouse，supplier未取 | oldgoods在warehouse，非showroom | 转warehouse不算supplierreturned；CRTNremaining仍在 |
| 2990误送取回 | 未正式receipt时PJ首次；已receipt时原identity移交 | 外部地址不变CarresSite；不duplicatefulfilPO |
| Cancel after pickup／part payment | 不把goods自动放回 | source停止remaining；reversephysical有新handover；refundFinance有独立结果 |
| Dealer新买display，未交货 | 不出现在present；planned可单查 | companybuyer/acceptedprice/paymentgate/demand/delivery清晰；terminalcustomersale不改 |
| 原单／owner不明开场货 | verified与unverified分开，不算可售 | 可以report/help，核对source；不创造历史sale/receipt/Guarantee |
| Supplier-owned display要求sale | currentdisplay仍supplierowner | 不提供sell/reserve；需改变经营模型则另ownerdecision，现阶段拒绝 |
| 图片读不到／请求断网 | 不自动零附件、已提交或已响应 | input/retrykey保留；sourceunknown/error有区别 |

**UNKNOWN：** 未在生产点击创建、接受、Issue、mark-opened、dispatch、send、付款或actualreceipt。Houzs某些读取/打开会推进stage／编号，因此本次选择静态source核对，避免把「研究」变成live mutation。没有新hire/usability计时、数据库fill rate、权限穿透测试或现场physicalcount；本稿不声称这些scenario已通过运行测试。

## 14 · 缺口处置、推荐的推翻条件与唯一审核

| 问题 | severity／fix | 推翻推荐的事实 |
|---|---|---|
| 原Dealer SO被当公司自购 | 🔴 FIX：Sales明确companybuyer，原终端channel保留，Money/Invoice/source同链 | 若证明现行source已完整支持公司买方/价款/发票/release/asset则复用现成，不再建新adapter |
| Dealer资产被硬塞Stock enum | 🔴 FIX：Service客户资产；Stock只记录其实际受托保管关联，不进ownedinventory | 若有现成CustomerAsset+custodysource全链已支持，则KEEP；若必须第二stockbalance才能运作，此方案需重新研究 |
| displayview来自订单或请求status | 🔴 FIX：自营Stock事实；Dealerassetactualobservation+handover证据 | 现场观察发现requestsubmit或Caseclosed使两地点同时在场，即失败 |
| supplierdisplay sale残留及ReadyStock门槛不全 | 🔴 FIX：按已批准§7.7全域删除sale/SoldtoSettle目标；sharedquery/atomicgate兑现eligibility | reservation/source证据证明supplierdisplay已严格blocked才可称READY；否则保持approvedgap |
| 普通Transfer只可Available，displayrepair货可能不可选 | 🟡 FIX：授权非sale实物移动contract，goodsissue/reservation保持保护；不解除hold来迁就selector | 若现有owningmove已合法覆盖精准display/repairgoods，则直接复用 |
| firstresponse sourceowner不完整 | 🟡 FIX：建议既有DeliveryDuty统一nonSOshowroomfirstresponse；后续原owner各自Work | 若两日回复在actualoperation持续漏交或Duty无法协调，则重审责任，不新建page-localowner |
| 原稿菜单摇摆 | 🟡 FIX：present与request两问分视图；formalinternaldocuments留owner | coldwalk只用一种查找就可完成所有§13场景且不丢newrequest/在外goods，才有证据减为一view |
| finalCOPY／render未知 | 🟡 FIX：本稿完整语义审核后进入原kit/COPY；不inline造UI | newhire说不出这里有什么／下一步／何时收到，需修composition，不改lockedtokens掩盖问题 |

**READY／COPY REQUIRED／ENGINE GAP mapping（是研究准备度，不是 READY FOR CARD）：**

| capability | verdict today | 理由 |
|---|---|---|
| 原customerSO、exactlinebinding、Receiving/Stock基础 | 🟢 READY，仅已有基础／有限module证据 | 不能扩大成完整Showroomready |
| supplierorder/partialsource/return、two-endmovement、sharedcommunication | 🟡 COPY REQUIRED + Carres适配 | 2990/Houzs及官方patterns已有；Carresbusiness/actualproof不同，不能直接复制backend |
| Dealercompanybuyer／客户资产／custody排除valuation | 🟡 COPY REQUIRED + authority/model适配 | Shopify/Dynamics有成熟模式；现有Carres不能当已建 |
| 全链scoping、sourceWork、duplicate/concurrency/feeaccept | 🟡 COPY REQUIRED / integrationgap | 原scope/idempotent/reservation/sharedWork已有基础；完整接缝未证明 |
| 无人解决的业务engine | 未证明🔴 ENGINE GAP | 没源码不能称需要发明；本稿不提出engineCard |

### Owner decision gate：一次审核整套经营模型

**当前owner审核焦点（2026-10-02）：** §6的5日内部核实／7日方案或明确进度／之后最多3工作日更新，是新增服务SOP推荐，尚待批准；两日firstresponse及新display正常Salesleadtime已解决。它补齐当前authority没有的supplier/Sales等待期间检查点，并非换菜单或新工程问题。

**已找权威：** ERP §2.1/§3；Purchasing §§7.7、9.8–9.13；Stock §§3–5、12.3、12.8–12.9；Service §1.1；Orders customercreate/record/revision；Payment §§1–3；Delivery §13.1；Workspace §§1–2；UI最新acceptedtemplate／COPY。新局部批准分支逐条核对，原建议未当law。

**为什么不是已解决：** 公司账号不等于公司买方；既有Stock明确排除Dealerstock，缺客户资产及受托保管全链；两日承诺未完整给统一nonSOintake责任；wholeBlueprint/最终placement未批准。

**实际经营方案与推荐：**

- **推荐：** 公司作为自己display的真实买方；Service客户资产保存原identity/source；返修只受托保管；两个查找视图从实际货与原请求分别进入；nonSOfirstresponse沿既有DeliveryDuty协调，后续各owner。不新增Dealer赊账／佣金抵货款。员工不用第二次录入。
- **另一真实选项：** Dealer仍靠每次手填型号／照片求助，不维护可核对的公司资产currentdisplay；公司购买继续线下，Portal只做服务。较少需要buyer/asset适配，但不满足「选原display、历史连续、现在现场准确」的完整任务，故不推荐。

此推荐改变的是公司购买和资产／firstresponse的经营接缝，不是要求Jess挑route／schema／codingmethod。整体审核可修正后替换本proposal；已批准规则不重问。所有未核实真实交易／现场facts按明确unknown路径运行，不能由整体批准自动「证实」。

**审核后 governing persistence：** 将唯一Showroom经营模型写入当前拥有模块的MASTER/ERP，各sourceowner细节留原MASTER；删除原相冲突的现行rule／旧placement，而非添加另一版本。是否需要独立ShowroomMASTER以实际新增独立经营record判断，本稿不建空MASTER或第二constitution。新COPY同次收口；记录ownerapproval与commit。之后才能声明PLANMISSIONCOMPLETE及给业务acceptance/dependency级handoff，不能在本PLAN自动Card/build。

## 15 · 可复核证据、参考矩阵及限制

### 读取基线

- **Carres current authority／source：** `origin/main` `73e0a12dd0f475ddb02d7cdb21c725916a133bac`，本次fetch后固定。独立只读研究／proposal worktree `/tmp/carres-showroom-independent-audit-20261002`。桌面主checkout仍`69ce9952f`且有collaboratorchanges；未在其上更新authority或应用。
- **当前持久化基线：** 独立分支 `codex/showroom-independent-audit-20261002` 已将八项局部owner rulings cherry-pick 到上述 main 基线（`36ef2ae6a` 至 `814ce620c`）。最新 `4ac5e1bf8` 已提交 Purchasing §9.8／Service §1.1：新display普通Sales lead time、无需公开每个内部步骤、默认时间设置及单次手动日期／优先调整。均 committed / unmerged；没有应用实现或生产验证。下列原局部分支只用于来源追溯，不是最新持久化HEAD。
- **新批准局部：** `/tmp/carres-showroom-dealer-ruling-20261002`，本次head`fe19e167dec83782955131bab04b5e1b0ffa0fb0`。读ERP§2.1、Purchasing§9.8、Service§1.1、Stock§12.3；包括845b94d4d、a285ac891、c996502eb、c5699c348、4e279a2e6、be93e2df9、23a6d331c、fe19e167d。是committedunmerged，不是main/live。
- **Purchasing planning：** `/tmp/carres-purchasing-menu-review` `018309d744572e3e49aad9d55492d39f393586a3`，supplierdisplay-only／multi-leg批准与navigationproposal分开；不操作其branch。
- **2990 original：** `/Users/chaichiewlim/Desktop/2990s` `a600b8d7`，已读AGENTS；visiblelocal`pnpm-workspace.yaml`修改未动。独立读apps/api、apps/backend及schema；不是Houzs同名code即可当原2990生产行为。
- **Houzs snapshot：** `/tmp/houzs-purchasing-plan-20261001` `ecce2e9676acc555efa8b2c30e78052b2ab54749`，读CLAUDE／service-caseguide及backend source。不是liveproof；未靠打开case推进state来验证。

### Carres primary evidence（行号属于上述 main snapshot，不属于旧桌面checkout）

| FACT | primary evidence |
|---|---|
| currentOwnership只有两种 | `supabase/migrations/0366_the_unit_register_is_the_one_inventory_authority.sql:108–139`；`packages/shared/src/unit-availability.ts:147+` |
| dealerId/outlet/customer角色不同；现有SO是consumer | `apps/api/src/routes/orders.ts:386–424,440–549`（customerprefill、JWTdealer、attributedoutlet）；OrdersMASTERbuyer/source／Constitution§7 |
| Showroom formal pages仍comingsoon | `apps/web/src/pages/portal/portal-nav.ts:401–404`；本次没有live重测 |
| `/ready`只按free/condition/needsrepair查，没有本routeownershipfilter | `apps/api/src/routes/ops/stock.ts:102–115`；不是全系统eligibility认证 |
| 共享availability参数不含ownership | `packages/shared/src/unit-availability.ts:69–104`；baseavailability与完整saleeligibility不得混称 |
| latestpooldraw源码有lockedrow/line/status/remaining但该function不读取ownership | `supabase/migrations/0600_a_unit_on_a_purchase_order_can_be_reserved_for_a_sales_order.sql:171–543`；全repofunctiondefinition检索见0292/0322/0471/0600；未宣称production现在允许supplier售出，live函数/外围guard未重测 |
| exactlinepredecessor／锁 | `supabase/migrations/0471_a_reserved_unit_names_the_sales_order_line.sql:275–329`；0600是后来定义，不能只看0471就称latest |
| Dealerdisplay不是CarresSite／Inventory；opening测试owner不可信 | StockMASTER§12.9，约`1810–1850`；§3storedidentity／§5physical；§12.8return/repair |
| currentstock仍有旧supplierdisplay sale／SoldtoSettle语句 | StockMASTER§5约`227–231`、§12.9约`1785–1803`，与Purchasing§7.7`1640–1657`冲突；后者明确2026-10-02owner-ruling |
| nonSOdisplaytransportexistingDuty | DeliveryMASTER§13.1`1927–1936`；不把coordinator当custodywriter |
| currentUI/COPY | UI§6.0／6.7–6.10及Confirmedsharedtemplate；01/02/03；COPYShowroomdocumentnames`1093+`，movementliteral仍proposal；WorkspaceMASTER§§1–2及ACTION-FLOW |

### Reference-to-Carres capability matrix

| reference capability／本次source | Carrescurrentequivalent／owner | KEEP/ADAPT/RELOCATE/BUILD/REJECT + why | dependency/conflict |
|---|---|---|---|
| 2990outgoingConsignmentOrderorder-only、customer/variant、downstreamlock；`apps/api/src/routes/consignment-orders.ts:1–95` | Sales／外部asset来源 | ADAPTdocumentlineage/configuration；REJECTDealerconsignment | DealerbuyCarreslocked；不能copy外部寄售经营模型 |
| 2990ConsignmentNoteOUT、cancelIN、loaner／COGS语义；`consignment-notes.ts:1–65` | Stock/Deliveryhandover | ADAPTsource/remaining；REJECTcreate/cancel即真实move | physicalproofseparate，Carresdisplaynotforsale |
| 2990outgoingReturnfree-entry、deltaIN；`consignment-returns.ts:1–22,178–295,343+` | 外部return/Stock/Service | ADAPToriginalgoods/returnabletrace；REJECTblankreturn/instantinventory | nofabricatedCarresreceipt／custody |
| 2990PCOrderorder-only、childlock、variants；`purchase-consignment-orders.ts:1–145` | PurchasingCO | ADAPTsource/version/children；REJECTduplicateReceivingengine | no普通payable，price-freeCO |
| 2990PCReceiveqtycap／partial、returnedrollup；`purchase-consignment-receives.ts:250–380` | Receiving | ADAPTremaining/overreceiptguard；KEEPoneCarresreceipt | accepted／damaged／wrongqty规则不同 |
| 2990PCReturnOUT/create/cancelreversal；`purchase-consignment-returns.ts:1–80` | PurchasingCRTN+Stock | ADAPTsource/partialremaining；REJECTstatus-drivenOUT/IN、默认suppliercredit | actualsupplierhandover、Finance独立 |
| 2990picksource/remainingguidedforms；`apps/backend/src/pages/PurchaseConsignmentReceiveFromOrder.tsx:4–6,89–110,222–236`；`PurchaseConsignmentReturnFromReceive.tsx:5–7,172–198,222–236` | Carresguidedprefill | KEEP选择原line/quantity原则；ADAPT直接从原request，不再空建 | exactidentity／companyscope不靠clientquantityguard |
| 2990transferPOSTED+pairedOUT/IN+cancelreversal；`stock-transfers.ts:381–470,480–513` | StockTransfer | REJECTrequest即arrival；ADAPTidentity/source | sourceavailability≠物理arrival；原子性不能替真实性 |
| Houzstransfercompanyguard、DBatomicpair；`backend/src/scm/routes/stock-transfers.ts:513–565`／`lib/stock-transfer-atomic.ts:1–65` | Stock/tenantboundary | KEEPcompanyguard／atomicprotection原则；REJECTpairatcreateasactualproof | legacy2990和Houzs实现不同，分别测量 |
| Houzswarehouse/showroom/display/serviceaxis；`backend/src/scm/routes/inventory.ts:109–110,170–207,279–300` | StockSite/use/owner | ADAPTpurposeviews；REJECTtype决定owner/DealerCarresSite | ownership/custody维度独立 |
| HouzsASSRcomment/nudge/activities；`backend/src/routes/assr.ts:1498–1558` | Servicecommunication | COPYcommentonce/auditablechannel；REJECTnudge代firstresponse | Carres2workingdaysresponse/read不completion；不新增无证据SLA |
| HouzsASSRattachments/visibility/download；`assr.ts:2257–2277,3142–3248` | Case/audience/scope | KEEP媒体原证据与公开范围；ADAPT全endpointscope，不能只copyreadguard | localidroute和attachmentidroute须各证authority；未做securitycertification |
| HouzsASSR7stages、markopened、roundtrip；`docs/modules/service-case.md`；`services/assrSupplierReturns.ts:1–118`；`assr.ts:1955+` | CarresService/RO/Delivery | ADAPT多round不覆写、source/proof；REJECTmandatory7／openadvance／readmintidentity | 不复制Carres上门inspection；本次不执行mutatingread |
| Shopifycompany/location/contact | Salescompanybuyer／People／scope | ADAPT真实公司buyer与location/actor | 不copy信用/terms/tax；不是existingCarresB2Bready |
| Dynamicsserviceobject/customerownedassetbilling | Serviceasset／Finance／Stockcustody | ADAPT资产非inventory仍可精确服务与收费 | 保留Dealer非Carresstock；不copyproject/credit账 |
| BusinessCentralship/intransit/receive | StockTransfer/Delivery | KEEP两端／partialfacts；REJECTdirectpostshortcut | Carres每handler实际proof比文件posting更严格 |
| Odoorepairserial／partsquotation／return、ownerstock | Service/parts/Stock | ADAPTserial及parts/service关联；REJECTsellingconsignment或直接模板驱动refund | searchresultcorroboration；完整pagefetchfailed，不能称全部doc已读 |
| AutoCountconsignmentoutstanding方向 | Purchasing/Stock | ADAPTsource与未归还范围；REJECTCarresdisplaysale/consumptionsettlement | 旧官方help，非当前安装产品walk |

官方来源（本次web检索／读取，均不是Carres权威）：[Shopify companies/locations](https://help.shopify.com/en/manual/b2b/companies-and-customers/index)、[Dynamics service objects](https://learn.microsoft.com/en-us/dynamics365/supply-chain/service-management/service-objects)、[Customer-owned maintenance](https://learn.microsoft.com/en-us/dynamics365/supply-chain/asset-management/integration-to-project-management-and-accounting/customer-billing)、[Business Central transfers](https://learn.microsoft.com/en-gb/dynamics365/business-central/inventory-how-transfer-between-locations)、[Odoo repair orders](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/repairs/repair_orders.html)、[Odoo ownership](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/daily_operations/owned_stock.html)、[AutoCount Consignment](https://www.autocountsoft.com/products/ac_accounting/helpfile/consignment2.htm)。Odoo全文返回error；只用官方搜索摘录确认serial/owner/parts概念，没虚称完整访问。Shopify、Dynamics、BusinessCentral正文可读取。AutoCounthelp正文很简短，不作现代产品功能全集。

### 研究结束时的四问

- **flow与source冲突：** supplierdisplaysale旧规则／readyquery/atomicgateownership缺口；公司buyer误认；修正在§14。
- **新员工会混淆：** 在场/已申请/在修/已收款/已发出用同一个status、Dealercompany等于login、return等于refund；本方案拆清事实但同源操作。
- **不能照旧直接实现：** Dealerasset/custody、companySales/Invoice、统一firstresponseowner与copy/adoption未闭合，不能从此稿直接build。
- **旧flow遗漏：** opening核实、partialmodule、returnfromrepair、多round、Dealer多地点外部move、cancelafterpickup、concurrency/attachmentexportscope；已在§§4–13逐项给完整目标。

**CURRENT MISSION：** 完整独立Showroom再审核推荐已写成一稿，等待owner整体验证／纠正。已批准局部不重问；新建议不是law。**RECOMMENDED NEXT STEP：** 审阅§1及§14的整套经营模型，明确批准或纠正后立即在原owningauthorities持久化并commit；此PLAN在完成该步以前不闭合，之后也不自动转BUILD。


## Owner-review clarification · 新购是否搬旧货与列表 UI（PROPOSAL / NOT LAW）

权威：Purchasing §9.8 已允许 new display placement 不选 outgoing Unit；replacement/removal 才选确切现有商品。新购不是必须一进一出。新增货与旧货实际移出分别完成，不能以新订单成立推定旧货已移走。

推荐入口：同一 Showroom 下两个用途明确的视图：当前展示品、订单与申请记录（名称为解释性草稿，正式屏幕用词须按 COPY 收口）。公司／地点按授权范围显示；已知地点自动带入，不默认所有地点权限。

新购表单：商品／数量／需要日期，随后问是否需要同时移走现有展示品。无需移走则直接继续；需要移走则从当前展示品选确切商品，记录去哪里／为何移走、需要搬出日期与是否必须先搬出才能送新货。未知目的地由Operation核实，不默认退回Supplier、退款或批准回购。Dealer已购货的移动须先明确接受方／安排／费用；自营货按原Stock及Supplier ownership路径。新购仍沿适用订单规则，相关搬出用同一来源关联实际执行，不重复建空申请。

订单与申请列表：一个提交／订单来源一行，显示编号、日期、地点、购买或服务性质、商品摘要、当前对外状态、需要／确认日期、待本方行动；搜索／筛选沿Register模板。购买显示正常订单事实，服务显示处理进度，不把统一列表当成统一状态机。相关旧货搬出在该记录详情呈现，不生成第二条人工提交记录；关联正式订单／Case／移动记录各由原模块拥有。

详情：购买部分沿Order Detail语法；选了搬旧货才显示旧货与安排区。维修从原商品发起，带入来源和证据，显示方案／费用接受／安排／结果。对外不列每个内部步骤。内部Operation看到具体依赖与下一行动。

当前展示品：只按真实到场／搬出／返还证据更新。部分交接逐件记录；新货到了而旧货未走仍有未完成搬出，不能整单假完成。旧货已移走而新货未到，当前展示如实显示缺口。申请历史持续可查，不当作现场库存。

经营取舍：多一个是否搬旧货的条件问题，换取提前发现空间／取送依赖；无旧货时不要求空填。推翻条件：走查新增、先出后进、先入后出、部分移动仍需重复填商品地点，或订单状态直接改变现场数量，则需改稿。


## PJ Showroom 已有库存：实际查询与owner ruling · 2026-10-02

已只读查询 Carres-Portal-v2 production project `kfprgpjpaffedghytstl` 的 `stock_unit_register_v`，限定 `site_name = PJ Showroom`：36个Unit，30个SKU，各qty=1；Unit范围U1-000-293至U1-000-328。本次查询各记录为carres_owned、free、condition=new；holder_name为空。此为数据库现有记录，不是现场盘点证明，不可把系统new推定为现场检查结果。

**OWNER-RULED：** Showroom 页面直接显示Warehouse已有的PJ location清单，不重新建opening stock，不另录一套展示库存。选择原Unit发起维修／清洁／更换／搬出；实际移入移出写回原Stock，页面读取同一事实。Dealer客户资产仍按不同ownership边界处理。既有PJ列表能力为可复用来源；Showroom入口及完整请求操作尚未因此变成已实现。


## 标签权威核对更正 · 2026-10-02

当前clean authority Stock §3及Purchasing §6.2的2026-09-25 ruling：供应商目前不必贴Unit标签，实际receiver贴／核对系统issued ID。先前引用desktop旧文得出supplier必须包装贴标的回答已更正；当前Purchasing旧相冲突段落与Stock Settings supplier requirement同次删除／对齐最新ruling。PO/CO official issue按Catalog identity mode生成身份，不是draft confirmation；quantity模式的pillow/protector等不发Unit ID。PJ36个数据库ID不证明36件实物已盘点或贴标。旧货使用原ID，核对来源／实物后贴同ID；已有关联或历史不可任意交换，同型号身份未明确须查证，不再分配第二个ID。标签打印目标尚未据本次调查验证上线。
