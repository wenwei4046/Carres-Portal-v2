# Service Cases — Plan (v1)

> 状态:**待 Loo 批准**。批准前不写 code。
> 日期:2026-07-07 · 作者:Claude(考古 + 设计)

---

## 0. 一句话

把现有 "Service Notes" 页面改造成 **Service Cases**:新增一个 **Case(病历)父层**,
把现成的 `service_notes` 表降级成 **Case 底下按需生成的"派工单"子表**。改名不新建面板。
Case Type / Status 做成 Supabase config 表(以后加类型只加一行,不改 code)。
主键/关联永久用 **Order ID**;Ref No 只作查找别名。

---

## 1. 考古结论(为什么这样设计)

- 现有 `service_notes`(0140/0142)**已经把"病历 + 派工单"揉在一张表**:有 SN 编号、
  Section A/B/C、status、current_stage、order_id、ref_no、打印页。**需求 D(派工单)几乎现成**。
- 缺的是:一个 **Case 父层**(把 What happened / Carres action / Affected / Charges 归到 case)
  + **config 化的 Case Type / Status**(现在是硬编码常量)。
- Ref No 反查**可行**:`orders.source_ref text[]`,用 `@> ARRAY['CR0418']` 查;
  现有 `/lookup` 只认 SO,需加 ref 分支 + 0/多匹配兜底手动填。
- `service_notes` 有 Jess 真实数据(2026-06-09 导入),迁移必须保留(backfill 成 case)。

---

## 2. 数据模型

### 2.1 新表 `service_cases`(病历,父层)

```
service_cases
  id                UUID PK          -- 内部主键
  case_no           TEXT UNIQUE      -- 显示编号 SC{YYMM}-NN(月度重置,复用 next_sn_no 模式)
  order_id          UUID FK orders(id)   -- ★ 永久关联键(可空:手动建 case 时暂无 order)
  ref_no            TEXT             -- 别名,仅查找/显示用(AutoCount 停用后会消失)

  -- 客户快照(从 order 带出;手动填时直接存)
  customer_name     TEXT NOT NULL DEFAULT ''
  customer_phone    TEXT
  customer_address  TEXT

  -- 分类(config FK)
  case_type_id      UUID FK service_case_types(id)
  status_id         UUID FK service_case_statuses(id)

  -- 简单病历(中性命名,留演进空间)
  what_happened     TEXT             -- What happened
  carres_action     TEXT             -- Carres action
  what_affected     TEXT             -- What was affected
  incurred_charges  TEXT             -- Incurred charges(v1 存文本,不做金额计算)

  opened_at         DATE NOT NULL DEFAULT CURRENT_DATE
  created_by        UUID FK auth.users(id)
  created_at        TIMESTAMPTZ DEFAULT now()
  updated_at        TIMESTAMPTZ DEFAULT now()
```

### 2.2 config 表(以后加类型 = 后台加一行)

```
service_case_types                 service_case_statuses
  id        UUID PK                  id         UUID PK
  code      TEXT UNIQUE              code       TEXT UNIQUE
  label     TEXT                     label      TEXT
  sort_order INT                     sort_order INT
  active    BOOL DEFAULT true        active     BOOL DEFAULT true
                                     is_closed  BOOL DEFAULT false  -- ★ Ongoing/Closed 由此派生
```

seed:
- types:`100-Day Trial` / `Warranty Claim` / `Delivery Damage` / `Customer Request`
- statuses:`Pending`(is_closed=f) / `In Progress`(f) / `Follow-up`(f) / `Resolved`(is_closed=t)

**列表 [All][Ongoing][Closed] 语义**:Ongoing = status.is_closed=false;Closed = is_closed=true。

### 2.3 改造 `service_notes`(降级成派工单子表)

```
ALTER TABLE service_notes ADD COLUMN case_id UUID REFERENCES service_cases(id);
```

- 派工单机制(SN 编号 / Section A/B/C / current_stage / 打印 / items)**全部保留不动**。
- 新流程:SN 永远挂在某个 case 底下(`case_id` NOT NULL for new rows)。
- **Reported Date** = 复用 `request_date`;**Target Return Date** = 复用 `deadline`
  (= reported + 14 工作日,默认值,可改)。→ service_notes **不需要加新列**(除 case_id)。

### 2.4 迁移安全(保 Jess 数据)

- **backfill**:为每一条现有 `service_notes` 建一条 `service_cases`,复制
  customer/what_happened,status 按旧 ongoing/closed → 映射到 `In Progress`/`Resolved`,
  `case_type_id` 留 NULL(旧的自由文本 type 无法 1:1 映射,Jess 之后可重打标),
  然后回填 `service_notes.case_id`。旧 SN 因此仍出现在新列表里。
- 纯 additive:不 DROP、不改现有列语义。RLS 沿用 operation+principal(镜像 0140)。

### 2.5 迁移号

> ⚠️ 写迁移前先 `list_migrations` 查 prod tail(memory 记录已到 ~0209,CLAUDE.md 的 0188 已过期)。
> 用下一个空号,例如 `02NN_service_cases.sql`。单文件包含:3 新表 + config seed + service_notes.case_id
> + `next_case_no()` RPC + backfill + RLS + index。

---

## 3. API(`/api/ops/service-cases`)

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/config` | 返回 `{ types[], statuses[] }`(active only,给下拉用) |
| GET | `/` | 列表(filter `?state=ongoing\|closed`,join type/status label) |
| GET | `/lookup?ref=CR0418` 或 `?so=SO-1147` | ★ 反查 order → 带出客户/型号/交货日期;ref 用 `source_ref @> ARRAY[ref]`,0/多匹配返回 `{order:null, matches:N}` 让前端提示手动填 |
| POST | `/` | 建 case(生成 case_no via `next_case_no()`) |
| GET | `/:id` | case 详情 + 底下的 service_notes 列表 |
| PATCH | `/:id` | 改 case 字段 / status |
| POST | `/:id/service-note` | ★ 从 case 生成派工单(带出 customer/order,SN 编号,默认 target=reported+14工作日),复用现有 service_notes POST 逻辑 |

- zod schema 全部进 `packages/shared/src/schemas/service-cases.ts`(一 schema 两消费者)。
- 现有 `/api/ops/service-notes` route **保留**(派工单 CRUD + 打印仍走它),只是新增 case 层在上面。

---

## 4. 前端

- **改名**:portal-nav.ts `label "Service Notes" → "Service Cases"`(key `service-notes` 不变,
  panel 不新建);页面 `<h1>` 同步改。
- **列表页**(改造 OperationServiceNotes.tsx):查 `service_cases`,列 = Case No / Type / Customer+Ref /
  What happened / Status / Opened;`[All][Ongoing][Closed]` + `[+ New Case]`。
- **New Case modal**:输入 Ref No 或 Order ID → 调 `/lookup` 自动带客户;0/多匹配 → 提示手动填。
  选 Case Type(config 下拉)+ 4 个病历字段 + Status(config 下拉)。
- **Case 详情**:显示病历 + 底下派工单列表 + `[生成 Service Note]` 按钮 → 开现有 ServiceNoteModal
  (预填 customer/order,Reported Date + Target Return Date)→ 生成 SN → 可打印(复用现有打印页)。
- config 下拉用 `/config` 拉,**绝不硬编码**。

---

## 5. Design token(⚠️ 需你拍板)

你给的 token(BG #EEECE6 / Accent **#D64F20** / Cal Sans / neumorphic)是**旧 warm-linen 原型**的。
但现有 Service Notes 页面 + 整个 portal 现在跑的是 **v17**(flame **#C44D2B** / Inter / cool-gray /
cream #F5F1EA / `.btn-hero` / `.pill-*`,见 CLAUDE.md §10)。

**我的建议**:跟现有页面一致用 **v17 token**(否则新页面和旁边的 Orders/Stock 撞色)。
→ 请确认:**(A) 跟 v17(推荐)** 还是 **(B) 强制用你列的 #D64F20 那套**?

---

## 6. 分阶段(批准后)

- **P1 — DB**:迁移(3 表 + config seed + case_id + RPC + backfill + RLS)。先 `list_migrations` 查号。
- **P2 — shared + API**:zod schema + `/api/ops/service-cases` 全 route + config + lookup(ref 分支)。
- **P3 — 前端**:改名 + 列表页改造 + New Case modal + Case 详情 + 生成 SN 按钮。
- **P4 — 测试 + 冒烟**:API route test + web render test;live 预览。

**v1 明确不做**:通用 workflow engine、金额自动计算、SN 之外的多类型派工、Ref 唯一约束。

---

## 7. 待确认(批准前回我)

1. Design token:v17(A,推荐)还是你列的 #D64F20(B)?
2. 现有 service_notes 真实数据 backfill 成 case:同意(推荐),还是保持旧数据不动、新列表只显示新 case?
3. Case No 格式 `SC{YYMM}-NN`(月度重置,跟 SN 一致)OK 吗?
