# HANDOVER — STAGE 3 AT THE WALL · 2026-08-10

> 新 chat 从这里开始。读完这一页,再读 `docs/STAGE-3-GATES.md`(🔒 冻结的 spec),
> 然后才读 `docs/BUILD-QUEUE.md` 的卡。

## 现在的状态 — 3.0 → 3.5 全部关闭,停在墙前

```
☑ STAGE 1   182d1cae   register + read-only workspace
☑ STAGE 2   2a6a5e9e   edit/create + revision engine
☑ 3.0 / 3.0-FIX / 3.0-EXTEND
☑ 3.1       6924aa8f   Classification Registry + build-time 穷尽测试
☑ 3.2       d9ba78fe   Consequence Floor Evaluator        (0328)
☑ 3.3       c781af60   Attribution SUBMIT/APPROVE/APPLY   (0329 · 0330)
            5b4f58f9   三条陈年假测试修好
            39e9950f   0331 锁月那句话不再吐空格
            95a11a84   三个动词三颗按钮,渲染测试钉住
☑ 3.4       c1a6fdb6   Downstream correction work         (0332 · 0333)
☑ 3.5       8e8224dd   Amendment spine + base_contractual_hash (0334)
⛔ 3.6 ISSUE / 3.7 ACCEPT / 3.8 CLASS-A APPLY — 墙外,owner 未裁,不准发明
```

分支:`stage3-preflight-merge`,head `8e8224dd`。migration tail = **0334,全部已进库**。

## 三份 Stage 3 文档以前**从未被提交**

`HANDOVER-STAGE3.md` · `STAGE-3-GATES.md` · `BUILD-QUEUE.md` 之前只是主工作区里的
untracked 文件 —— 包括 owner 已经说「我同意」的冻结 spec。一次 `git clean` 就没了。
这次一并提交进仓库。以后它们跟着分支走。

## 墙外的两件事,仍然不准发明

```
3.6 ISSUE   amendment 文件长什么样 —— 没定
3.7 ACCEPT  签署机制(手写/OTP/e-sign/回签 PDF)—— 交给律师
3.8         依赖上面两个
```

`sales_order_apply_amendment` 现在**无条件拒绝**,这个拒绝本身就是 3.5 的交付物。
它在读 status、比 hash、跑 floor **之前**就拒 —— 一个只在别的检查通过后才生效的
拒绝,等于门内侧的锁:ACCEPT 落地那天,绕过那些检查的路径就会应用一份没人接受的
amendment。

## 必须清理的测试数据

```
SO-1312 / SO-1313 / SO-1314   3.2 建的 delivered / invoiced / 锁月 fixture
一条 approved 的 July 2026 commission run
```
**Stage 3 全部验收后清掉。** SO-1307 / SO-1308 是 owner 裁定保留的 regression
fixture,不在此列。

**这次取证在真数据上留下的痕迹,报给 owner 决定:**
- `SO-1308` 的 salesperson 经完整 lane 从 `ahsihas` 改成了 `Alvin`(Rev 4 是它的
  记录)。数量和电话已还原,Rev 1/2/3 一字未动。ledger 是 append-only,所以现在到
  Rev 8。要改回去就再走一次 lane。
- `SO-1206` 数量已还原。它留下 2 条 correction work(PO-2036 已关、PO-2037 仍开),
  是 3.4 机制的真实证据。

## 每张卡开工前必跑的回归扫描

```
SO template 里那句采纳措辞         → 必须在
grep -i "tax invoice" (rendered)   → 必须零
register search 仍走 server        → Stage 1 回归测试
SO-1308 Rev 1 仍重放自己的快照     → qty 1 · 无承诺日
```

## 唯一没交的东西:1440 / 1130 截图

代码全部跑通并在生产库上取了证,但**登录要输密码,这一步不是我能代做的动作**。
Owner 在浏览器里登录一次之后,截图即可补上。页面在:

```
http://localhost:5191/operation/orders     (stage3-web · API 8891)
```

要看的三处:Sales Order 文档页的 Source 区(who this order belongs to)、Items 区
下方(propose a change)、Purchase Orders 页顶部(Sales order changes to check —
只在有活时出现)。
