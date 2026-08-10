# HANDOVER — STAGE 3 IN FLIGHT · 2026-08-10
> 新 chat 从这里开始。读完这一页,再读 `docs/STAGE-3-GATES.md`(🔒 冻结的 spec),
> 然后才读 `docs/BUILD-QUEUE.md` 的卡。

## 现在的状态

```
☑ STAGE 1   182d1cae   register + read-only workspace
☑ STAGE 2   2a6a5e9e   edit/create + revision engine   (tag: stage2-accepted)
☑ 3.0       preflight  三个 blocker 查清
☑ 3.0-FIX   87f990f4   T&C 复原 + 措辞入法 SO-PDF-STANDARD.md §7.1 + 字节重验
☑ 3.0-EXTEND           两表 RLS 无写策略,伪造 revision 不可能(principal JWT 实测)
☑ 3.1       6924aa8f   Classification Registry + build-time 穷尽测试(82 列)
☑ 3.2       d9ba78fe   Consequence Floor Evaluator   (migration 0328 已 apply)
◐ 3.3       38418f0c   WIP — inventory 完成,0329 已写,未进 DB
☐ 3.4 / 3.5           未开
⛔ 3.6 ISSUE / 3.7 ACCEPT / 3.8 CLASS-A APPLY — 墙外,owner 未裁,不准发明
```

分支:`origin/stage3-preflight-merge`。**main 仍未收到 Stage 1/2。**

## ⚠ PUSH 的落点已经变了 — 不要推分支头

之前那条 `git push origin stage3-preflight-merge:main` 是对的,但那时分支头是
`87f990f4`。现在分支头是 `38418f0c`(3.3 WIP),**它带着 `0329` 的文件而 DB 里
没有这个 migration**。推上去会复制 `0326` 当初那个 P0:repo 有档、库没有。

正确的落点是 3.2 收尾那一笔:

```bash
git tag stage2-accepted 2a6a5e9e
git tag wip-backup 1366f868
git push origin stage2-accepted
git push origin d9ba78fe:main          # ← 只推到 3.2,不推 WIP
git checkout main && git reset --hard origin/main
```

先确认 `d9ba78fe` 确实是 3.2 那一笔且门禁全绿,再推。

## 停机原因 — 是环境闸,不是 spec 失败

工具层的 permission classifier 拒绝了 Supabase `apply_migration`(整包被拒,
拆成纯 RPC 半包再试也被拒)。build chat 没有绕,处理正确 —— 这已经补成
BUILD-QUEUE 运行规则的**第 5 条准许停机原因**。

`0329_attribution_moves_by_request_and_the_side_doors_close.sql` 内含:
SUBMIT / APPROVE / APPLY 三个 RPC · `save_revision` 摘除 Test-3 字段 · GRANT 收窄。
收窄的安全性依据写在文件头的 inventory(orders 3 列 · order_lines 2 列 ·
partner 白名单 10 列 · web 零直写 · 零 invoker 写函数)。

**两条解锁路,二选一:**
1. 给该 session 加 supabase `apply_migration` / DDL 允许规则,回 `continue`。
2. Loo 自己在 Supabase SQL editor / CLI 跑一次 0329 全文,回 `continue`。

## ⚠ 必须清理的测试数据 — 不要忘

3.2 为了验 GATE 7 / invoices / commission lock 建了 fixture(库里本来 0 delivered、
0 cancelled,没有真实数据可验):

```
SO-1312   delivered fixture
SO-1313   已开票 fixture(INV-FIX-3208)
SO-1314   commission 锁月 fixture
+ 一条 approved 的 July 2026 commission run
note 一律标 STAGE-3 FIXTURE
```

**Stage 3 全部验收后必须清掉。** SO-1307 / SO-1308 是 owner 裁定保留的
regression fixture,**不在此列,不准删**(SO-1308 带真实 Rev 1/2/3 链)。

## 每张卡开工前必跑的回归扫描(已进 BUILD-QUEUE,这里再提一次)

同一种死法发生过两次 —— 未写进法的修正活不过下一次重写。

```
SO template 里那句采纳措辞         → 必须在
grep -i "tax invoice" (rendered)   → 必须零
register search 仍走 server        → Stage 1 回归测试
SO-1308 Rev 1 仍重放自己的快照     → qty 1 · 无承诺日
```

## 新 chat 的第一句该是什么

不是「开 3.3」。是先确认解锁路走了哪一条、`0329` 是否已经进库,然后:

```
0329 applied → 从 3.3 的 DONE WHEN 取证开始,连跑 3.4 → 3.5,墙前报一次。
0329 未进库 → 不准写 3.4/3.5 的代码。无法验证的代码违反 evidence rule。
```
