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

取证途中 Rev 9 的归属,**上一版报告写错了,这里更正**:Rev 9 是**架构师那个 session**
在 13:58 MYT(= 05:58 UTC)跑 SAVE 冒烟测试时写的,用的是 owner 已登录的
`operation@carres.com` Chrome session。是**另一个 SESSION,不是另一个人**。

结论本身不变,而且值得留着:我的 APPLY 在那次写入之后跑,只写了 salesperson,
那通电话号码原封不动 —— GATE 5「显式列白名单、绝不 payload spread」被一次真实的
并发写入验证过,不只是被我的测试验证过。

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

## FIX-LIST 第二轮(架构师,2026-08-10)— 三条

**① dev server 指向生产 —— 已在仓库层面堵死。** 实测:这台机器上 **19 个 worktree
有 18 个** 的 `.env.local` 把 `vite dev` 指向 `carres-portal-v2-api.wwch.workers.dev`。
`.env.local` 是 gitignored 的,所以仓库里任何东西都看不见它 —— 改文件也没用,下一次
`git worktree add` 又会重来。守卫写进了浏览器真正跑的代码:

```
DEV build + 不是本机的 base  →  app 拒绝启动,ApiBaseMisconfigured
刻意要连远端                  →  VITE_ALLOW_REMOTE_API=1 pnpm --filter @carres/web dev
```
`apps/web/src/lib/api-base.ts`,7 条测试。**在真浏览器上双向验证过**:指生产时 root
是空的、控制台抛出点名了文件的错误;指本机时正常渲染。生产构建不受影响
(`.env.production` 本来就该指 Worker)。

**② `GET /:id/attribution` 500 —— 已修(0335),并补了机械守卫。**
`sales_order_attribution_live` 排序用了 `order_change_requests.created_at`,
**那张表从来没有这个列**(真名是 `requested_at`)。plpgsql 只在创建时解析函数体,
未知列要到运行时才炸;而 API 测试 mock 掉了 `rpc`,所以它证明了「门调用了哪个函数」
却一行函数体都没执行过;3.3 的实证跑了 SUBMIT/APPROVE/APPLY,唯独没跑这个 READ。
三个绿灯,一个坏接口。

修完之后**真的调了**:无请求 / 从没有过请求 / pending(名字解析正确、approver 路线
正确)/ approved。守卫在 `packages/shared/src/sales-order-request-columns.test.ts`,
只检查**当前生效的那份定义**(0330 已被 0335 取代,而已提交的 migration 不能改)。
它覆盖两种写法 —— `v_req.<列>` 和裸列;**第一版只抓到前者,把 bug 放回去时没咬,
所以补了后者**,现在重放真 bug 会失败并点名 `created_at`。

**③ SO-1206 的两条 correction work —— 已关**,note 一律
`STAGE-3 EVIDENCE — not real work`。库里现在没有任何 open 的 correction work。

## ⚠ 三件需要你一句话的事

1. **`SO-1312 / SO-1313 / SO-1314` + July 2026 commission run 仍在。** item 1 已修,
   但清理需要你在对话里明说(红线 1)。
2. **SO-1206 最早那条 closed 的 note 是我取证时写的**,内容是
   「PO-2036 checked — the extra pillow is covered by the existing quantity」——
   它**读起来像一个真实的采购决定**。建议连同 fixture 一起改掉或清掉。
3. **SO-1307 上有一条 approved、未 apply 的 attribution request**(id
   `c42b07f6`),是 item 2 为了跑通 READ 而建的。它会让 SO-1307 的文档页出现一颗
   「Apply the change」。我没有删(红线 1)。

## ⚠ GATE 3 的 HR 半边,在这个库上无法端到端验证

`select * from app_users where role='hr'` → **零行**。0330 就是为了让 HR 能读到
request 才写的,但库里没有任何 HR 账号,所以那半条 lane 只在代码和门测试里成立,
没有真人跑过。我不会去建账号。
