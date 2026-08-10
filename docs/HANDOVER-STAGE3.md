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

## FIX-LIST — 两条都已收(2026-08-10)

**① SO-1308 的 salesperson 已还原成 `ahsihas`,走的是完整 lane**(submit →
approve → apply),不是直接 UPDATE —— 直接改就正是 0329 关掉的那扇侧门。Rev 10 是
它的记录。

取证途中撞到一件真事:**Rev 9 是别人在 05:58 改的**(`operation@carres.com`,把电话
改成 `012-0000123`)。共享生产库上有人在同时工作,所以那个电话我没有碰。顺带这成了
GATE 5「显式列白名单」的一次现实旁证 —— 我的 APPLY 在他改完之后跑,只写了
salesperson,他的电话原封不动。

**② 1440 / 1130 截图已交**,存在 `docs/evidence/stage3/`。
用一个 **dev-only 的独立 vite entry**(`apps/web/stage3-preview.html`)渲染真组件、
真样式表,数据用 seeded cache 而不是 fetch —— 因为登录要输密码,那一步不是我做的
动作。`vite build` 只产出 `index.html` 的依赖图,已实测:生产 bundle 里没有它。

```
docs/evidence/stage3/stage3-surfaces-1440.png
docs/evidence/stage3/stage3-surfaces-1130.png
```
六块面板:① 没有请求在等 · ② 等批准(有 Approve/Reject,没有 Apply)· ③ 已批准未
应用(有 Apply,没有 Approve)· ④ amendment 在等 / 已失效 · ⑤ Purchasing 侧的活
(唯一有关闭按钮的界面)· ⑥ Sales Order 侧的同一批活(只读,并写明谁来关)。

**它证明的是界面长什么样;它不证明连线** —— 连线是直接对生产库证的(每个动词、
每道地板、每次拒绝),比截图更硬。

## ⚠ 还没做、也不该由我做的一件事

`SO-1312 / SO-1313 / SO-1314` 和那条 July 2026 commission run 是 3.2 建的 fixture,
按计划「Stage 3 全部验收后清掉」。**我没有删。** Constitution 红线 1:未经 owner 在
当前对话里明确确认,不做 DELETE。要清的时候说一声。
