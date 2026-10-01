# Purchasing — 当前下单阻断审查与最小修正建议

日期：2026-10-01。**PLAN / READ-ONLY AUDIT；建议不是新业务法，不是Card或开工授权。**

## 1. 结论

**不要重建采购模块。保留当前需求、批准、来源、Unit、共享PO审阅、发送记录和供应商答复能力，修通已经证实的入口阻断与缺资料后的恢复路径。**

本次完成两种买入入口的只读实查，未完成两笔真实新采购的端到端交易：当前审查账号在进入新PO审阅前已遇权限门，且本PLAN不允许创建PO、发送、审批或收货。不能把“界面打开了”写成“下单已通”。

| 发现 | 证据层级 | 最小修正建议 |
|---|---|---|
| SO选择商品后只显示 `Only PO Duty can issue this PO`，无法进入PO审阅 | 本轮真实UI观察，限当前账号；当前源码仍为旧权限门 | 对齐9月29日已批准普通Operation执行权；区分执行权限、当值责任、商业审批；先验证当前账号的person/role事实，不能给所有Principal一律开权 |
| 已批准Manual请求选中后显示 `Issue 1 PO`，却没有Issue按钮，也无拒绝原因 | 本轮UI和源码均证实 | 保留同一PO审阅，补上明确的拒绝/读取失败原因和正确下一步；不要再建一套发单页 |
| 已有Manual来源PO的正式文件因目的地无地址不能生成；旁边仍显示发送确认动作 | 本轮UI观察；文件失败与确认按钮条件源码可追 | 在原供应商/地点主档修复真实缺项，返回原单继续；使预览失败与发送动作的可执行性表达一致，不能伪造过去发送记录 |
| Chrome Operations会话PO列表报加载失败，独立Principal会话能加载63张PO | 两个会话的真实观察；差异原因未知 | 追实际失败请求、身份/权限、旧标签页版本和必需读取；不能直接断言全站故障或归咎roster |
| 一张已发送SO来源PO能打开详情、显示发送记录、进入逐行供应商答复表单 | 本轮UI验证到未保存表单 | KEEP；不重复开发供应商答复，仍需后续获授权的真实保存/接收验收 |

## 2. 证据基线与纠正

- **源码基线：** 已执行 `git fetch origin main`，`origin/main = 74b4981b62a50cb159d677e07429f8fc03fcf519`。Purchasing MASTER **6,697行**。按这个固定提交读取，不使用当前旧工作分支冒充主线。
- **生产版本：** 本轮只读GET [ERP部署信息](https://erp.carresofficial.com/__carres_deploy.json) 与 [API health](https://api.carresofficial.com/health)，两者均返回同一提交 `74b4981b62a50cb159d677e07429f8fc03fcf519`。这证明这两个端点的部署标识一致，不证明数据库迁移或旧浏览器缓存一致。
- **本地参考快照：** `/tmp/carres-purchasing-main-74b4981`，从该提交读取的文档/源码副本；不是运行环境，没有修改其中应用代码，也没有执行迁移。
- **独立审查浏览器：** `erp.carresofficial.com`，现有登录显示 `Sara · Principal / PRINCIPAL`。没有切换身份、模拟其他人、读取认证token或修改账号。
- **另一个Chrome会话：** 显示 `Logistics · Carres HQ / OPERATION`。浏览器有并发操作，因此转用独立审查页；不声称其错误在重试后仍复现。
- **撤回旧现状结论：** 之前用 `401c2e2` 的旧工作区审查并提出本地§17，遗漏大量9月批准与实现。这份旧提案已从本地MASTER移除；旧377项Carres测试结果不再用于说明当前主线可用性。旧“六门soon”“唯一剩余业务决定”“共享UI kit缺失”等不能继续作为当前结论。尚未批准的余量关闭提案暂停，不再要求owner先决定它才能下单。
- **不改变已批准最小复用原则：** 本地提交 `69ce9952f` 只记录owner的复用方法，尚未合并到origin/main。本审查不是将旧分支整体合并的建议。

## 3. 当前权威所规定的路线

主线 [AGENTS](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/AGENTS.md) 已指向 [CLAUDE constitution](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/CLAUDE.md)。本次重读其入口/治理和采购相关权威，重点追踪ERP §3.3–3.5、Purchasing §§5.2–5.6、8、9.1–9.3、当前SO→PO接缝与共用UI/Copy；不宣称本轮逐行重审完6,697行以及全部其他模块。

| 分类 | 当前权威事实 |
|---|---|
| RESOLVED FROM AUTHORITY | [Purchasing §5.3 L317起](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/docs/purchasing/MASTER.md#L317)：所有在职Operation员工可做普通PO工作/发PO，含首月新人；当值仅决定正常责任归属，商业审批和禁止自批仍独立。现行旧gate是待收敛实现，不是新业务选择。 |
| RESOLVED FROM AUTHORITY | [§5.2 L279起](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/docs/purchasing/MASTER.md#L279)：六种Manual目的、每笔都需申请批准；MPR有自己的身份，不是供应商PO。不存在绕过申请批准的自由采购门。 |
| RESOLVED FROM AUTHORITY | [§9.2 L2223起](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/docs/purchasing/MASTER.md#L2223)：Manual已有创建/退回编辑和共享PO review；价格未记录可下PO的规则已有0573，不能恢复旧“缺Catalog价必挡”假设。旧实施记录明确仍欠真实生命周期验收。 |
| RESOLVED FROM AUTHORITY | [§5.6 L578起](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/docs/purchasing/MASTER.md#L578)：生成正式PO与人员记录“已发送”分别有事实。Portal的发送标记是人员声明，不证明供应商已收到、阅读或接受；缺标记也不证明从未发送。 |
| APPROVED TARGET / NOT BUILT | 普通Operation执行权仍需对齐；不能靠UI显示按钮绕过服务端，也不能把新规则扩大为商业审批权限。 |
| BUILT / VERIFIED（本轮窄范围） | 列表、选择、部分对象、发送事实读取、供应商答复表单可到达；下表列明实际停点。新申请提交/批准、新PO/发送和收货都没有执行。 |
| REAL GAP / CONTRADICTION | Manual静默隐藏动作；源码继续用旧出单许可且Copy仍有Only PO Duty；文档地址缺项阻挡正式PDF后缺少原对象可继续的明确闭环。 |

**UI约束：** 最新constitution的ONE KIT LAW已经指定tokens/components/page-patterns/UI MASTER；不能再以旧UI-KIT.md缺失要求重做视觉权威。本次不画新组件，不改变已批准Register、选中动作条、对象和共享Review语法。新增错误说明必须在原Copy authority维护。

## 4. 实际操作记录（不写业务数据）

### 4.1 SO Batch Purchase

1. 打开 `/operation?tab=purchase`。加载完成显示 **32 Sales Orders：To buy 5 / No purchase needed 27**。
2. SO-1365有Need PO、Nice Future商品及可选checkbox。选中后显示 `1 Sales Order · 1 item · 1 unit · Issue 1 PO`。
3. 同一动作区显示 `Shasha · PO Duty`、`Only PO Duty can issue this PO`；没有Issue按钮。因此未到Review，不能声称PO生成、分组、PDF已验通。
4. Clear后未保存任何业务变化。
5. 观察到SO-1358显示PO-2039有可用Fenrir King，而行仍可选；这是原“不能买也不能预留”问题已有改进的迹象，不可继续用旧报告说它完全没有处理。未点击Use this PO，因为它会写预留。
6. SO-1206有 `SKU not found` 且选择被禁用。缺SKU是需要保留的合法阻断；本轮没有认定应该绕过它或断言其数据根因。

### 4.2 Manual Purchase Request

1. 打开 `/operation?tab=manual-purchase`。**4 requests：Need approval 0 / Need PO 1 / No PO needed 3**。
2. 可买行显示Approved、Ready Stock、8022/Ohana，同时MPR No为Not recorded、Requested By为Staff identity not recorded。历史缺字段是观察，不能擅自补造或认定是下单拒绝原因。
3. 选中后显示 `1 selected · 1 unit · Issue 1 PO` 与PO Duty头像，但只有Clear/Export，**无Issue按钮也无原因**。截屏确认不是AX遗漏。源码的 `mayIssue ? button : null`吻合。
4. Clear后打开 `+ Manual Purchase Request`：表单有Request Details、Supplier Delivery、Items、右侧预览；空表单Send提示 `pick a date`。
5. Ready Stock自动选 `No, buy new stock` 是9月28日已批准的特例，源码有明确purpose变更处理，不误报为违反显式选择规则。
6. 未填写/提交申请；点击Cancel返回，仍是4条请求。没有批准请求或写PO。

### 4.3 既有PO与文件

1. 独立Principal会话的PO Register能加载 **63 purchase orders**：55需要确认发送、4等待货、4Completed。这里只是观察组计数，不代表55张都从未发过，也不诊断重复单。
2. 打开Manual来源 `PO-20260904-5805`：看见来源 `MPR-20260904-9508 ×1`、Ohana、数量1、已收0；Supplier Deliver To是Ohana。
3. `Issue current PDF`只切换本地模式。打开后文件区域明确报：`No address on file for this PO's destination` / `Ask Purchasing to add the address of that place in Settings.`；没有可用正式PDF。
4. 同一界面显示可点击的 `PO sent to supplier`。**未点击**，也未打开WhatsApp/email、复制消息或下载。只能认定界面未随文档失败表达清楚，不能声称服务端允许假发送或该PO从未在外部发送。
5. 关闭预览返回Register。

### 4.4 已发送SO PO与供应商答复

1. 打开 `PO-20260903-6426`：Issued；现有WhatsApp发送标记日期29 Sep；来源SO-1203，Unit U1-000-003，数量1，已收0；Current action要求问逾期货何时到。
2. `Record supplier answer`能打开逐行表单，含Confirmed / New date / Split delivery、Supplier DO、证据、渠道、Recipient、Answered by/时间。
3. 初始Save禁用并说明需答复一行或记录DO；Cancel返回，没有保存。
4. PO说明没有connected receiving session。因此没走真实收货，不把“Receiving区存在”当receipt已完成。

### 4.5 会话差异与运行限制

Chrome Operations会话最初显示PO Register加载错误并建议检查PO register/roster；随后其他操作改变页面。本轮未获得其具体失败响应，不能把错误归因某条数据库规则。独立Principal会话成功读取同一站点列表，证明至少该会话可读，不能推断普通员工也可读。没有用管理员权绕过员工身份验证。

## 5. 代码因果链与具体最小修正

以下均固定主线提交 `74b4981`。**代码证据不是数据库实测；实际拒绝原因仍需在原账号追读。**

### B1 · 普通执行权与Duty未收敛

- [DB capability 0403 L48](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/supabase/migrations/0403_operations_superuser_po_issue_authority.sql#L48)：superuser或旧purchasing_po_actor；本轮后续migration搜索未发现将该函数扩展为所有在职Operation的替换。
- [0533 L509](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/supabase/migrations/0533_a_duty_belongs_to_a_person_and_jess_approves_purchases.sql#L509)：principal还需is_person才获得相应superuser途径。**页面显示Principal不能证明当前账号应被允许。**
- [API共用能力读取](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/apps/api/src/lib/purchasing-po-authority.ts#L3) → [SO发单 L318](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/apps/api/src/routes/operation/to-order.ts#L318) / [Manual L2341](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/apps/api/src/routes/operation/manual-purchase.ts#L2341)仍共同拒绝mayIssue=false。
- [SO UI L1522](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/apps/web/src/pages/operation/so-batch/SoBatchRegister.tsx#L1522)据同一boolean显示按钮或Only PO Duty。

**修正建议：** 保留单一capability门，在整个普通出单/发送路径落实已批准Operation权限，记录正常Duty、cover、实际操作者。保留个人身份、在职、请求批准、商业例外和禁止自批；绝不是给所有角色开权限。旧roster读取也须遵守Shared Duty Resolver归属。无需owner再批准同一业务法。

**验收边界：** 合法的非当值Operation本人可从两种入口进入审阅并完成获授权交易；未授权/非person/停用账号仍按规则拒绝，理由可见；当值责任不会被实际操作人覆盖。

### B2 · Manual没有动作也没有原因

- [Manual UI L1859–1880](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/apps/web/src/pages/operation/OperationManualPurchase.tsx#L1859)：`mayIssue`为false时直接null，正是本轮看见的空动作区。
- [Manual API L739](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/apps/api/src/routes/operation/manual-purchase.ts#L739)：authority读取出错只记录日志并留下false，界面无法区分无权限与权限暂时无法读取。
- [Manual L872起](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/apps/web/src/pages/operation/OperationManualPurchase.tsx#L872)：已复用SO的SoBatchIssueWorkspace，选择只准备review，正式写入在后面。无需再移植整套Houzs Review。

**修正建议：** 保留表格/选择/共享Review；无法继续时显示原Copy规范的“原因＋具体下一步”，且区分合法拒绝和读取失败。权限失败不能伪装业务拒绝，摘要也不能让员工以为已完成发单。

**验收边界：** 每个选中结果都有可执行的下一步或可理解的原因；retry返回原选择；Cancel不生成PO/Unit/占用需求。

### B3 · 文件地址缺项与发送动作脱节

- [print-data API L1607起](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/apps/api/src/routes/operation/pos.ts#L1607)把document authority的destination_address_missing返回为422。**这是保护，不应靠删除检查来“修通”。**
- [PO split L1481](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.tsx#L1481)将版本/供应商交给PoIssueEvidence；[证据组件L237](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/apps/web/src/pages/operation/components/PoIssueEvidence.tsx#L237)的ready仅依recipient/saving/confirmed；[L291](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/apps/web/src/pages/operation/components/PoIssueEvidence.tsx#L291)确认另发请求。不能从此直接断言后端校验也缺失。
- [页面测试L894](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.test.tsx#L894)覆盖错误文字，不代表“补资料→重新预览→实际发送”已经验通；本轮没重跑此测试。

**修正建议：** 在原地点/供应商owner维护真实地址，从错误状态深链正确记录，回来重读并保留原采购选择；在源选择/预览阶段提前暴露完整性。对本次发送明确要求可用的正确版本；对于过去已在外部发送的记录，保留历史事实与证据补录，不因今天地址缺失断言以前未发。不得自动补地址、标已发或重建PO。

**验收边界：** 这张PO能生成包含正确目的地的正式文件；改主档不改历史发送版本；文件失败不会让员工误认为本次发送已经可完成；真正的发送标记仍是本人对指定版本的声明。

### B4 · 会话加载错误不能靠重画页面解决

[PurchaseOrdersPage L488起](https://github.com/wenwei4046/Carres-Portal-v2/blob/74b4981b62a50cb159d677e07429f8fc03fcf519/apps/web/src/pages/operation/purchase-orders/PurchaseOrdersPage.tsx#L488)：requiredReadError取pos/suppliers/warehouse；Duty已从强依赖中移除。错误文本仍提owner roster，不能据该句诊断roster故障。

**修正建议：** 工程追原Operations会话失败的具体读取和响应，在现有接口/读取恢复处修复；保留已成功对象读取。必要事实读不到时明确失败，装饰性owner badge失败不能拖垮全页。无证据时不宣称缓存、权限或数据库为根因。

**验收边界：** 合法Operations账号可稳定加载；模拟各必需读取失败时知道失败范围且能retry；只读成功不代表出单成功。

## 6. 哪些应保留，哪些才需要Houzs

| 能力 | 当前判断 | 处理 |
|---|---|---|
| 需求、来源分配、单号/Unit、历史记录 | 当前已有基础；本轮未重验所有写入 | KEEP，不因入口卡住重建 |
| SO/Manual共同PO审阅 | 当前源码已复用SoBatchIssueWorkspace | KEEP；不要再引入第二个Review |
| 发送记录/供应商逐行答复 | 本轮能读取并打开表单 | KEEP；修权限与失败接缝，写入完成仍待授权验证 |
| 普通PO执行权限 | 已批准目标与现有门不同 | 落实现行法，非新功能采访 |
| 权限/资料缺失后的下一步 | 已证实可用性缺口 | 改现有提示和深链，不重建页面 |
| Houzs审批去向预览/Before–After | 适合在具体已证缺口中研究 | 只取最小交互原则；本次三个阻断不需要复制整个Houzs采购模块 |

Houzs仍固定研究提交 `ecce2e9676acc555efa8b2c30e78052b2ab54749`。此前141项Houzs本地测试只适用于该克隆；不证明Carres当前下单。没有确认Houzs复用许可，不能把候选代码标成可直接COPY REQUIRED。**本次修正优先复用Carres现有共同能力，暂无必须移植外部引擎的证据。**

## 7. 批准范围、交付验收与未知项

用户本次yes授权只读下单阻断审查；没有转BUILD。没有修改应用、数据库、账号、地址、库存、采购记录或发送事实；没有联系供应商。只打开/取消未保存表单、清除本地选择。旧错误提案已撤回，研究文件原位改写，没有新建Card/执行队列。

**建议的业务验收终点（不是实施Card）：** 以真实合法执行人完成一笔SO采购、一笔批准后的Manual采购；范围/数量/供应商/目的地正确；审阅取消不生成记录，正式操作只生成一次；正确当前PDF可准备并实际发送、发送声明可追溯；供应商答复可保存，Receiving能够从正确来源接收；未授权动作仍被拒绝。生产写入验收需后续BUILD接管和相应实际交易授权，当前不执行。

**仍未知：** 当前Principal账号的is_person/operations_superuser真实值及此次mayIssue=false是拒绝还是读取错误；原Chrome Operations会话具体失败响应；DB函数部署体与migration逐项一致性；两笔新交易实际保存/发出/收货结果；完整新版采购其他页面的运行完成度。没有把这些未知交给owner猜，也没有以研究结束冒充模块完成。

**无需新业务决定才能提出修正：** 执行权规则、单一Review、资料完整性、实际发送和模块归属均有现行依据。下一个工作边界是用这些已批准规则修通并验证买入主链，而不是再次从零规划采购，也不是要求owner先批准本轮已撤回的余量政策。PLAN MISSION COMPLETE和整个模块READY都未宣告。

## PO object continuation — 2026-10-01, read-only UI evidence

Source inspected: origin/main `2b9119eb09978d3844bcfac620ac1b261eb3e45a`.
The separate live browser session displayed Sara / Principal. This is a read-only walkthrough,
not proof of ordinary Operation write permissions or proof that this source SHA was deployed.
No PO, receipt, send, supplier message or settings mutation was performed.

- PO-20260903-6426: Document opened; Current action states the supplier date passed and asks staff
  to contact the supplier, but has no local action button. Record supplier answer is elsewhere in
  the Purchase order block. KEEP the existing form; connect the next action to it rather than
  introducing a second writer.
- Revisions opens and lists Current document V1 and Sent document V1 with a download control.
  This verifies the entrance and displayed version only; no file-content comparison was made.
- History opens and shows the named actual sender, time and channel. An older issue event uses
  a generic principal identity; missing historical identity must not be reconstructed.
- Order Route opens and links SO-1203. SC-1051 is visible as one connected claim but is plain text,
  not an exact-record link. Code also renders receipt/claim detail rows as ConnectionRow text and
  supplies only aggregate Open Receiving / Open Claims and Returns entrances.
- PO-SMOKE-A: receipt is explicitly voided. Open Receiving successfully navigates to the exact PO
  context; its activity shows posting, amendment and voiding. Received Qty 0 is consistent with
  the void, not evidence of a lost receipt. The exact GRN object was not separately opened here.
- Receiving displays an Operation-only save notice for this Principal session. No write attempted;
  personal-identity eligibility was not established, so no server-authorisation defect is claimed.

Source-confirmed approved-target gaps, not new owner questions:
- PurchaseOrdersPage.tsx:1830 derives line pending quantity locally as max(0, qty - received_qty),
  with no cancelled-quantity display. Rule 1 needs the single authoritative remaining balance;
  otherwise completed short-close and displayed pending quantity can disagree.
- PurchaseOrdersPage.tsx:1350 and 1850 hide the current cancelled document, while historical sent
  version controls exist separately. Rule 1's cancellation revision/send journey needs explicit
  convergence; do not remove historical documents or claim none are accessible.
- PurchaseOrdersPage.tsx:1638 hides Current action for Completed/Cancelled. Goods completion must
  not suppress a still-required cancellation-version communication action.

Recommendation: retain register/object structure, supplier answer form, kept documents and audit.
Complete exact-record navigation, a directly usable current action, and Rule 1/2/3 consequences in
those same surfaces. Scope remains PLAN review; these findings do not expand PR #1827 or certify
PO workflow completion. Next UI evidence needed: actual revised/cancelled/partial receipts, old-PDF
content comparison, ordinary-Operation account, narrow-screen and keyboard paths.

# Recommended Carres Purchasing Completion Blueprint — consolidated owner review

**2026-10-01 · 完整完成方案／PROPOSAL NOT LAW。** 本节把已批准目标、缺陷及建议集中起来，
不是第二份 MASTER，不重新审批已经决定的规则，不授权 Cards、应用修改或外部切换。
范围是采购全域：BUY、RECEIVE、PROBLEMS、SHOWROOM、Settings、Reports，以及 Work/Stock/Orders/
Delivery/Finance 的交接。既有 MASTER 的详细规则继续有效；以下明确标记为建议的内容尚不生效。

## A. 依据与验证边界

- Carres 源码基线：origin/main `45f43e96b92305583fa176a17d5222152dc5eb9a`。
  本轮四项批准规则、MP/pillow 两个月中国补货及渠道规则已经在该 main 的 MASTER 中。
  这只证明文档入库，不证明相应功能上线。此前“全都仅在分支”的报告已不再是当前状态。
- 法律顺序：CLAUDE/AGENTS → ERP-ARCHITECTURE §§3.3–3.4 → Purchasing MASTER →
  Orders 修改/取消、Stock 身份/库存/预留、Delivery 实物流转、Payment 客户款、Service 客诉、
  Workspace 分配/实际操作人 → UI MASTER、COPY、导航、tokens。独立模块保留自己的写入权限。
- Purchasing MASTER §§5.8.1–5.8.3、§5.6、§11、§14 为本轮最新批准事实；§9 为既有页面目标。
- 当前 UI 只读测量：PO-20260903-6426 Document/Revisions/History/Order Route；
  PO-SMOKE-A → Receiving。已验证页面入口、实际显示及上下文跳转；未写入业务事实。
  主体样本仅 Sara/Principal 会话，不代表普通员工完整权限验证。
- SO/MPR earlier read-only walk: selection/review entrances and named blockers observed; no issue/
  supplier send was performed by PLAN. BUILD reports tests and PRs independently; those claims
  are not relabelled here as independently reproduced production proof.
- Houzs main `ecce2e9676acc555efa8b2c30e78052b2ab54749`，本地研究位置
  `/tmp/houzs-purchasing-plan-20261001`。Document intent: `docs/modules/purchase-order.md`,
  `purchase-order-amendment.md`, `purchase-return.md`, `purchase-consignment-order.md`.
  Code: `backend/src/scm/routes/mfg-purchase-orders.ts`, `purchase-returns.ts`, `grns.ts`,
  `backend/src/scm/lib/po-revision.ts`, `po-line-import.ts`; frontend SCM query/PDF/line-lock helpers.
  研究记录中的早期测试结果仅针对当时运行的纯函数/mock 范围；本次整合没有重跑测试。
  不能据测试文件存在推定通过；没有 Houzs runtime/production 验证。没有找到可据以直接移植的
  明确授权证据，复用权仍 UNVERIFIED。Houzs 不能代表全部原始/当前 2990 行为。
- Primary benchmark: Microsoft Dynamics purchase-order overview (sections workspaces/statuses)
  https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/purchase-order-overview
  and consignment (physical receipt versus ownership/financial event)
  https://learn.microsoft.com/en-us/dynamics365/supply-chain/inventory/consignment .
  借鉴职责分离，不照搬其状态、负数退货、审批或 consumption 规则。

## B. 已经决定的运行方式（RESOLVED FROM AUTHORITY）

采购只从 SO 未覆盖需求或批准的 Manual Purchase 进入；原有需求公式唯一，不能复制一份库存、
完成状态或采购数量。员工从现货/已有 PO 分配后，只买真正缺口。MP/保护套和枕头使用仓库
实际现货；从中国补货提前两个月，不套用七个工作天，也不凭“常备货”虚构库存。
床垫/床架/沙发供应商工作日分别为 7/7/14；不得把月份和工作日混成同一个字段。

普通有权限员工可帮忙；Assigned to 与实际 Updated/Completed by 分开。没有经理也能运行。
商业审批由既有 Purchasing Approver（现在 Jess）负责，无费用普通取消按新规则直接完成。
不把“可帮忙”扩大成任意改价、Finance 操作或任意商业审批。

四项业务规则保留：
1. 取消未收余额保留原订数、收货数、取消数、历史与版本；供应商同意/不能供应的证据、
   Yes/No/Not confirmed 费用事实分别处理；财务跟进不等于取消本身结清款项。
2. Cannot supply 记录事实，来源逐份决定；不能直接换 SKU；恢复供货日期不是承诺交期。
   Manual 替换新旧需求关联，批准新需求时停止被替代的旧需求，避免双买。
3. Price changed 不停止员工下单、发单、收货、配送；金额和商业决定留在其权限内。
   价格变更接受后保留版本/重发；缺价首次补录与改价分开。付款问题不能倒改实物收货。
4. 顾客取消生效后先找相同款/尺寸/配置/布色的其他需求；床垫/配件保留；普通易售布色可由
   员工保留；难售床架/沙发未开工请求取消，已开工不能取消则继续接收。不是新采购，不另买一次。

## C. 一天怎样工作，以及完整旅程

早上从 My Work/Team Work 查看到期采购、今日收货、逾期供应商、索赔/回收/维修未完成事项。
每项显示对象号码、供应商、真实日期、负责人及直接操作入口；同事可协助，不必先抢任务。

采购窗口打开 SO Batch 或批准的 Manual；先利用可用库存/已有 PO，再准备缺口。Review 使用
现有同一套预览，缺失资料指出具体行和负责设置。生成 PO 不等于发送，打开 email 不等于发送。
Hookka/Ohana 按已确认邮箱发送；实际发送后记录版本、渠道、收件人、操作人及时间。

下午按实际供应商回复更新承诺/分批，缺货或改价走对应已批准规则。Receiving 从原 PO/CO
记录实际数量、Unit/数量模式、Supplier DO、损坏/错货/多货，完成后生成 GRN；Stock 据事实
更新库存和预留。原待收余额仍由同一个来源计算。

发现问题，从收货/Unit 开 Supplier Claim；回复不等于批准结案。批准退货/维修后生成对应
单据，实物交接改变保管位置；承诺取货、打印 PDF 都不能代替实际交接。客户 Service Case
与供应商库存 Claim 可关联，不能相互当作必填前置条件。

展示业务从一张 Display Request 组织多条进出/换货/调拨腿；每条腿都有来源、货、地点、
执行人和完成证据。供货商所有权和 Carres 所有权必须可辨认。寄售货真正交付顾客后才触发
既有 Sale Notice，Finance 再处理供应商发票；没有第二套收货或库存账。

下班前看到未发送版本、仍欠的货、未回复/未取回/未返修和 Finance 未完成交接。只完成
真实完成的动作，不用“全部完成”盖住另一个模块的问题。

## D. 每个页面的完成目标与当前证据

| 页面/工作区 | 当前分类与证据 | 保留/补齐后的操作与完成边界 |
|---|---|---|
| SO Batch | BUILT / VERIFIED：早期本轮只读选单与共享 Review；普通账号实际发单由 BUILD 验收 | 保留按 SO/行的 register、筛选、数量说明和共享 Review；准确读取 Stock/已有 PO；重复提交不能重复买 |
| Manual Purchase | BUILT / VERIFIED：只读列表/create/cancel；共享 Review 源码已接入；全流程未由 PLAN 验证 | 申请→批准/退回→共享 Review→PO；本人不自批；已批准换货关联新申请与旧需求停购 |
| Purchase Orders | BUILT / VERIFIED：线上 Document/Revisions/History/来源及收货入口；§5.8 新异常仍目标 | 保留主体；Current action 直达现有表单；取消数量/文档/后续动作一致；准确直达 Claim/GRN |
| Receiving | BUILT / VERIFIED：具体 PO 上查看 posting/amend/void；本轮没有 post | 同一 receiving 门处理 Unit 与计数物品；正常、损坏、错货、多货分开；修正/作废不抹历史、不错误释放已消耗库存 |
| Supplier Claims | 实现存在：OperationSupplierClaims/SupplierClaimPanel，§9.5 目标；完整运行未验证 | 从 Stock/receipt 证据进入，说明问题、供应商回答、受权决定、后续退/修/补及剩余责任；不得拿供应商回答当结案 |
| Purchase Returns | 实现存在：OperationPurchaseReturns/PurchaseReturnRecord/issue surface；空 register 不证明完整 | 来源为批准 outcome；原 Unit、取货安排、发送记录、实际交接、Finance 只读衔接；发退货单不能让库存先消失 |
| Repair Orders | 部分实现存在，但退回后的 inspection 入口被报告缺失（断点 8）；不能称为仅需验证或完整可用 | 原 Unit 出去、原 Unit 返回检查；替换另建身份；发送、供应商接收、同意、返还分别有证据；返修逾期不能因一次回复就关掉 |
| Display Requests | APPROVED TARGET / NOT BUILT：portal-nav 仍 soon；§9.13 有细节 proposal | 一个安排显示所有进出腿，既有 Unit 从 Stock 选，新货从 Catalog 选；销售协商、Operation 代录、实际执行分开 |
| Consignment Orders | APPROVED TARGET / NOT BUILT：导航 soon | 从展示安排/批准来源生成，使用同一 Receiving；明确 supplier-owned；收货不产生应付款 |
| Consignment Returns | APPROVED TARGET / NOT BUILT：导航 soon | 原 Unit/保管方/取货/交接可追溯；换货各腿独立，不因新货先到假设旧货已取走 |
| Consignment Sale Notices | APPROVED TARGET / NOT BUILT：导航 soon | 成功 Delivery 的 exact Units 生成一次 notice；失败配送不算出售通知；重试不重复，Finance 另结算 |
| Settings | 已有 supplier/category/production/calendar；channel 门正由 BUILD 完成 | 一个供应商维护入口、正确目的地、明确角色和审计；值修改不重写已发文件；MP/pillow 补货月份单独保留业务语义 |
| Reports/export | RESOLVED FROM AUTHORITY §12；本轮未验证每份报表实现 | 来源缺口、余额/逾期、质量/claim/return/repair、未发送版本、寄售货与销售通知；export 尊重筛选和金额权限 |
| Work/Quick Rail/Calendar | Workspace 是唯一负责人/任务规则来源；Purchasing §10 定义业务触发 | 同一源表单、同一完成事实；Quick Rail 提供上下文，不复制表单；Calendar 使用正确工作日、时区与真实业务日期 |

## E. Reference-to-Carres capability matrix 与复用判断

READY 只表示该行明确测量过的窄能力，不等于整域 ready。COPY REQUIRED 必须同时证明适配
语义/数据/权限/UI/依赖及复用权；本轮没有任何外部代码足以直接获得这个结论。
ENGINE GAP 只表示本轮已检查证据中没有合适现成解，不声称全世界没有实现。

| Capability | Houzs evidence | Carres authority/current | Decision / benefit / dependency | Reuse |
|---|---|---|---|---|
| 需求→采购 | purchase-order.md; mfg-purchase-orders.ts SO conversion | §5.1/§9.1, existing shared issue | KEEP：准确缺口，保留来源；Stock/Orders 仍各自写入 | READY：已有入口；全写入链未验证 |
| Manual 审批→采购 | Houzs PO create 不证明 Carres 内部申请规则 | §5.2/§9.2 shared Review imported | KEEP：同一个下单门；批准与价格分离 | READY：共享 Review 接入；完整生命周期 UNVERIFIED |
| 编号/Unit | Houzs revision suffix/line identifiers | §6 company identity and permanent Units | KEEP：不复制外部编号，不重建身份 | READY：本轮 UI 可见已有 Unit/PO；并发创建 UNVERIFIED |
| Register 筛选/查找/导出 | PO frontend/query/export modules | §8 templates, existing registers | KEEP/IMPROVE：快速定位，不增加独立任务列表 | READY：已见 register；全部筛选/导出 UNVERIFIED |
| Before/After/revision | amendment doc + po-revision.ts snapshots/lease | §5.4 and existing revision writers | ADAPT 原则：旧纸保留、变更可读；不引入第二改单引擎 | UNVERIFIED：完整交互/rights 未证 |
| 取消余额 | inspected PO cancel covers whole-order gates; no proven matching short-close | §5.8.1 approved target | BUILD in existing PO：数量/来源/财务通知一起一致 | ENGINE GAP：本轮无匹配现成方案 |
| Cannot supply | legacy status/hold 不等于按 Carres 来源决定 | §5.8.2 target; SupplierReplySection lacks choice at inspected prior main | ADAPT existing answer entrance；不换 SKU、不自动取消 | ENGINE GAP for full cross-source outcome; form reuse READY |
| Price changed | Houzs holds/price mutation are foreign business rules | §5.6 price never stops Operation | REJECT hold; BUILD factual response + restricted commercial continuation | UNVERIFIED：已有商业机制但完整新语义未证 |
| SO 取消后的货 | Houzs allocation/cancel code | §5.8.3 + Stock exact reservations | KEEP existing reservation; ADAPT disposition; no second MPR | UNVERIFIED end-to-end |
| 部分/多/错/损收货 | grns.ts and inherited variant tests | Architecture §3.4, Purchasing §9.4 | KEEP one receipt authority; wrong/extra not available | NOT READY：多送货处置存在断点报告（3）；已有收货历史/UI 不证明多送货闭环 |
| Return lineage | purchase-returns.ts GRN line links/remaining cap | §9.6 source-derived returns | ADAPT source cap; REJECT stock OUT at document creation | UNVERIFIED direct code reuse |
| Repair | reference not proven equivalent end-to-end | §9.7 + RepairOrderObject | KEEP existing Unit/custody; 补 Stock inspection 与 RO 入口（断点 8） | NOT READY：退回检查闭环缺失报告；BUILD 复现待补 |
| 寄售 | purchase-consignment docs/routes with separate families | §§9.8–9.13; nav soon | ADAPT ownership principle; REJECT duplicate receipt engine | ENGINE GAP for complete Carres composition |
| 同时修改/重复提交 | po-revision transaction/lease, import drift guard | Carres version guards/shared writers | KEEP/ADAPT principles; retry must not duplicate commitment | UNVERIFIED complete coverage, not a new engine licence |
| 行导入 | po-line-import.ts preview/apply fields and drift checks | no approved broad import commission | DEFER；future narrow preview through same writer, no silent qty/price edit | UNVERIFIED rights/semantics |
| 扫码 | no verified equivalent source for Carres Units | Stock/Receiving own scan | KEEP those scanners, no PO-created parallel identity | UNVERIFIED this pass |
| Copy PO | reference create/copy is not source authorisation | §12.1 owner rejects | REJECT in this scope；new demand stays traceable | Not selected; runtime button failure unverified |
| 跨 PO 批量操作 | bulk-supplier-date code/test | owner defers §12.1 | DEFER；one-PO multi-line != cross-PO bulk | UNVERIFIED adaptation/rights |
| Supplier score | reference feature not independently runtime verified | §12 approved performance reporting | KEEP reporting target；no new score engine | UNVERIFIED implementation |
| Scheduled supplier price | reference future price logic | Catalog ownership | RELOCATE to Catalog；no Purchasing price master | UNVERIFIED implementation |
| Portal/API | legacy statuses and writes need convergence | §14 no cutover authority | DEFER external work; canonical PO facts only | UNVERIFIED; no account disable |

## F. 挑战结果：Current → Problem → Better → Trade-off → Recommendation → Falsifier

1. 现有 PO 页保留完整骨架 → 当前动作只写文字、Claim 单号不可直达 → 连回现有 owning form/record →
   需要统一 deep-link 和返回位置 → 补连接不重画整页 → 若入口已经直接打开正确对象且保留列表上下文，
   对应 finding 应撤回。证据：PurchaseOrdersPage CurrentAction / ConnectionRow / OrderRoute；线上样本。
2. Completed/Cancelled 隐藏动作和当前 PDF → 新批准取消版本仍需通知供应商 → 数量完成与待发送动作分开 →
   会出现“货已结束但仍要发文件” → 保留真实待办而不复活收货 → 若新版本发送在共同入口已完整可见，
   不需要重复按钮。证据：该文件 cancelled/CurrentAction 条件；MASTER §5.8.1。
3. 各处用 qty-received → 取消数量加入后会显示错误待收 → 读取同一权威余额 → 需覆盖列表/详情/Work/Orders →
   不加页面私有算式 → 若共同 read 已含 cancelled 且所有消费者一致，停止改动。
4. Houzs 退货创建即写库存 OUT → 文件不等于真实交接 → 用 Carres Stock 交接事实 → 需要员工记录实物动作 →
   保留 Carres 所有权/保管边界 → 只有证明该创建本身就是受控实际交接事件才可改变此判断。
5. 四个展示页仍 soon，Repair 却已有路由 → 总称“全没做”会重建已有代码 → 分别分类 → 要花时间做实际旅程 →
   按功能证据保留、补齐 → 生产完整演示可以把具体行提升为 BUILT/VERIFIED。
6. MASTER 开头仍要求逐页等老板同意，§13 仍禁止普通员工所有 PO cancel → 与本轮完成方式/§5.8.1 冲突 →
   最终同一 MASTER 替换旧 resume 和权限概括，普通取消明确引用其条件，其他修改不擅自放权 →
   需对全文作一致性检查 → 文档统一，不再访谈已有规则 → 若发现后续明确 owner overturn，依最新 ruling。

## G. Lifecycle coverage / non-goals

创建与来源：SO/MPR/Claim/Display/Delivery 均有 owner；无 blank PO。身份与编号：正式编号、版本、
Unit/quantity 分类不变。查找/筛选/列宽/导出：复用同一 Register grammar，按内容与权限处理。
编辑/批准：依行为权限，business change 不借 UI 绕过。文件：当前/历史可访问、旧版不被改写；
PDF download/email opening 不是假发送。复制：本轮拒绝。取消/关闭：源需求、承诺、实物、财务分别结束。
配置：Settings 单一入口、审计/有效期，不能回写旧文件。导入：本轮无新 importer；扫码保留 Stock/Receiving。
批量：保留现有允许能力，跨 PO 延后。History：谁/何时/原因/数量/证据，未知历史不猜。
并发：提交重新检查收货/版本/分配，失败不部分完成，重试不重复。权限：访问和动作都由 owning source
验证，UI 隐藏不是安全边界；Operation 金额权限须包含 API、附件及 export。完成：物理完成不掩盖通知/
claim/repair/Finance outstanding。Reporting：读事实，不复制商业账。

外部边界：现用邮箱保留；未来 API、供应商登录关闭、integration cutover 都需要独立授权。
不自动采购、不猜最小库存、不把补货“两个月”换成工作日或随意的 60 天。
不增加主管职位、不重新审批普通协助、不把价格问题变成 Commercial Hold。

## H. 真正未闭合事项与下一步边界

已决定的普通采购业务无需再问。剩余主要是工程验证，不是 owner interview：精确权限、异常回滚、
旧 PDF 内容、所有来源数量、窄屏/键盘、发单与收货真实运行，都由交付负责测量。

Showroom MASTER §9.13 明确仍有 Finance matching/posting contract 与部分详细 copy/composition
的 NOT LAW 内容。推荐先完成其现有约束下的界面组合，财务交接只传原事件/Unit/供应商/单据，
不得冒充已具备唯一核销/自动记账能力。其精确 Finance 合同尚未证实；不会据此重问已定所有权，
也不把未定财务机制交给 BUILD 猜。Opening stock ownership/identity 必须以实物/现有记录验证。

供应商 portal 是否停用是另一个尚未授权的对外动作，非本次正常采购运行前置条件，保持现状。
MP/pillow 两个月补货不包含自动补货阈值；此项不阻止仓库现货分配，也不新增老板问题。

现有 BUILD 继续完成下单 unblock，其测试/上线验收独立报告。其余依赖关系是：可信需求/身份/
收货与版本事实支撑 PO 异常；PO/receipt/Stock 事实支撑 Claim/Return/Repair；同一套能力再支撑
Showroom 多腿安排，Reports 读取它们。此处是业务依赖，不是 Cards、任务拆解或额外 BUILD 委托。

**本次交付是完整的一份推荐完成方案，供一次性 review。** 保留所有已批准 rulings，不再逐页
要 owner 批准。整合建议的呈现和文档一致性修订尚待整体审阅；不声称整个模块 PLAN MISSION
COMPLETE，更不声称每个页面都已上线。批准后应在唯一 MASTER 中替换过时摘要和矛盾，不能
把本研究文件当第二份 governing truth。


## I. Consolidated break register — source audit supplied by owner, origin/main 45f43e96b

2026-10-01. 此表与 A–H 的完整页面目标组成同一份完成方案，不是另起 Blueprint。
下列缺陷由用户转交的代码审计提供，BUILD 运行复现未完成。除明确说明外，不声称本 chat
已逐一独立验证全部调用链；具体行号按提供的基线核对，不能把旧缺陷套到已修的新 main。
本 chat 已核对 supplier-claims.ts 的 /close 与 /hold-resolve 路由存在；该代码还明确写明
实物解除限制与 Claim 文书关闭可以分开完成，不能把两者强制绑成同一次操作。

| # | Reported break / evidence locator | Recommended repair and business acceptance |
|---|---|---|
| 1 | 0500:830–860 unproceed_order can return proceeded SO to Place despite PO lineage/reserved/PO-bound Units | Refuse the bypass when those commitments exist. Preserve the governed Orders amendment/cancellation path and Rule 4; do not prohibit every legitimate customer cancellation. |
| 2 | shared manual-purchase.ts around 1475 closes Issue-PO Work on numbered PO rather than sending | Complete that send obligation only on current-version confirmed-sent evidence. Keep request approval, creation and sending as separate facts; partial/multiple POs must all be accounted for. |
| 3 | Extra receipt goods only in receipt JSON; no controlled Stock/Claim continuation reported | NOT READY. Record actual excess custody as controlled/unavailable goods and source-linked extra-goods Claim under existing Receiving/Stock authority. Exact-unit and quantity-mode identity remain different; do not mint IDs for counted accessories or invent PO/demand/payable. Validate the authorised identity path before implementation. |
| 4 | supplier-claims.ts:546 /close exists but no UI; reported guard only asked+answered | Expose existing governed close action with MASTER §9.5 evidence/outcome checks. A reply alone cannot certify outcome completion; closure does not automatically free stock or settle money. |
| 5 | supplier-claims.ts:580 /hold-resolve lacks UI; 0589 generic make-available refuses claim holds | Make the authorised goods-result action reachable from Claim; preserve separate physical release/inspection and paper closure timing. Never an unconditional release button. |
| 6 | 0602:1138–1143 replacement Unit lacks PO linkage; original pending/source requirement stays unresolved | Restore exact replacement/source lineage and correct reservation; resolve original obligation once. Distinguish replacement of accepted goods from fulfilment of previously unaccepted goods to avoid double-counting receipt. Preserve old and new Unit identities/history. |
| 7 | stock.ts:601 /ops/stock/supplier-returns/:id/pickup has no usable screen | Provide the owning Stock outbound-to-supplier handover surface, linked from Return; actual pickup evidence, exact goods and receiver resolve custody. Review its concrete composition before delivery; no parallel Purchasing stock writer. |
| 8 | 0602:897–934 repair flag clears on inspection but inspection action is absent | NOT READY. Add the owning Stock Record inspection entrance and RO Inspect link; pass/fail and disposition determine availability. Returning physically is not automatically passing inspection. |
| 9 | po-window-work.ts:290 / work.ts:1778 omit blocked SO demand from Work | Name blocked source lines and their exact owning setup door on the PO-window action; do not require an employee to discover missing setup by chance. Avoid duplicate work for the same source fact. |
| 10 | pos.ts /:id/cancel + 0560 legacy cancellation bypasses source/reservation/partial safeguards | Trace callers and close the bypass, preserving history; converge onto Rule 1's guarded cancellation. Do not delete needed source behaviour merely because an endpoint is old. |

Smaller reported gaps retained in the same acceptance set:
- Balance-delivery-date Work producer; arrival risk compares effective supplier arrival with source
  required arrival. Do not overwrite customer promises or confuse recovery estimate with delivery.
- Completion writers on MPR/ready-stock actions; MPR approval Work resolves approver/cover through
  Workspace and obeys separate approval rules.
- Calendar uses poExpectedArrivalsOf instead of a competing /purchase/today calculation, while
  keeping original PO date, supplier date and work due date semantically distinct.
- Retire the obsolete PO Default Delivery Date label only where it truly means PO Delivery Date;
  SO Batch supplier setup link reaches Settings.
- Supplier payment-terms setting uses existing purchasing_settings_gate, not a new Manager role.
- Existing procurement/receiving reports become reachable from central Reports with governed export.
- Dead endpoints and legacy per-supplier procurement shell: verify actual callers/dependencies,
  preserve historical reads, then retire obsolete write doors.
- MASTER §13 must reflect explicit 2026-09-29/2026-10-01 rulings per action. Ordinary issue and
  Rule 1 cancellation do not by inference authorise every revision/destination/commercial action.

Recommended dependency order for the combined completion scope (owner review; not Cards and not
an automatic expansion of the commissioned unblock): A integrity (1,2,3,10) → B close problem
journeys (4–8) → C four exception rules and remaining supplier-channel work → D Work/date coverage
(9 plus related gaps) → E remaining copy/links/reports/settings permissions → F remaining Showroom
completion against its existing Blueprint. Cross-cutting copy/permissions/Work needed by a slice
ship with that slice; they are not postponed to leave A–C unusable. Already delivered channel work
is verified/reused, not built again. F does not restart approved showroom business rules; only
remaining composition/Finance contracts need closure, in a distinct PLAN lane if necessary.

Each business slice requires an authenticated, controlled test journey and evidence of downstream
quantities, documents, actual actor, permissions, failure/retry and completion. Test existence or CI
success alone is insufficient. No unauthorised external message or live supplier commitment is
created for a test. Supplier-account shutdown remains outside approved scope. This combined scope
is the final recommendation for owner review; approving it must be explicit before expanded BUILD.
