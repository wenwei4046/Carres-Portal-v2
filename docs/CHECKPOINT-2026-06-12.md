# CHECKPOINT — 2026-06-12 (end of day)

> **For the next chat**: read `CLAUDE.md` first, then this file. This is the handoff
> from the 2026-06-12 session (Orders table V2 + ops cockpit polish + Payments panel).
> Everything below is **pushed to `origin/main` @ `0068421`** but **NOT deployed** —
> deploy is the first job tomorrow.

---

## 1. Where things stand

| | |
|---|---|
| origin/main | `0068421` (8 commits pushed end-of-day; previous deploy point was `d18f87e`) |
| Live web bundle | `index-CT0X1lXJ.js` (from `d18f87e`, deployed this morning) — **8 commits behind main** |
| Live api Worker | also pre-session — **missing 3 new endpoints** (see §3) |
| DB (live Supabase) | **migrations 0164 · 0165 · 0166 ALREADY APPLIED** via MCP — schema is ahead of the deployed code, which is safe (all additive) |
| Tests at checkpoint | web 532 pass / 5 pre-existing fails (§17.7) · api typecheck clean (suite not re-run after the last route; it has no test yet — see P8) · shared 193/193 |

**Deploy gap risk**: the dev preview AND prod both hit the live Worker, so the
Payments page + bulk "Mark completed" **404 until the api deploys**. Deploy api + web
together.

---

## 2. What shipped this session (all on main, not deployed)

1. `539e265` **Cockpit tweaks** — Calendar day cells show per-day delivery **count**
   (orders, not units) + header date `12 Jun 26`; Keep lightbulb icon gets a notes-count
   badge; Tasks assign dropdown = operation-role only + the shared account renamed
   "Operations" (**migration 0164**); completed task rows report **"Done by {who} · {when}"**
   (API stamps `claimed_by` if ticked done unclaimed).
2. `2c42b78` **Orders readability** — header "Order ID", Customer cell drops the phone,
   Items compact, Deadline as a coloured pill.
3. `75aeead` **Payments panel** — NEW operation menu = the Master Sheet **Balance tab**.
   **Migration 0165** extends `ops_order_control` with `balance` / `storage_from` /
   `storage_fee_override`. `GET /api/operation/payments` + edits via the existing
   `PUT /:id/control`. **Storage-fee rule (LOCKED)**: accrues from the order ETA
   (or manual `storage_from`), per commenced period, **MS/BF RM150/month · SOF RM200/2-weeks**,
   manually overridable; `computeStorageFee()` in `@carres/shared` (7 unit tests).
   Summary strip + Owing/All filter + inline-editable balance + status dropdown.
4. `2323124` **Orders V2** — deadline short form `10d` / red urgent ≤1d; tier-coloured
   status-tab counts; red **Urgent N** chip; **Region pill row** (Klang Valley · each
   state · Others, with counts, stackable with status tab + Urgent).
5. `29dec0c` + `d86b613` + `3c98911` **Items cell** — goods-unit total bold on the LEFT
   (services like Disposal NOT counted, mirrors the Master Sheet "8 X" math);
   **monochrome** tier tags (core darkest/semibold · accessories mid-grey · services
   lightest); single-category orders drop the duplicated qty ("1 [SOF]").
6. `0068421` **5-point pass** — `fmtDate` app-wide is now **"6 Jun 26, Sat"** (date first);
   tags use Master-Sheet codes **MS / BF / SOF** on **two lines** (line 1 core, line 2
   acc+service); Stock cell = ONE 3-state pill (🟢 `Ready n/n` · 🟡 `Waiting h/n` · ⚪ `Not set`);
   **bulk "Mark completed"** in the ⋮ menu (**migration 0166** RPC `ops_bulk_complete_orders`,
   SECURITY DEFINER, scoped to `source_system='autocount'`, stamps `delivered_at` +
   `order_history`, returns completed/skipped) + `POST /api/operation/orders/bulk-complete`.

**Answered for Jess**: the 105 "Overdue" rows are real dates from the AutoCount listing's
**"New- Delivery Date"** column — mostly orders already delivered in real life before the
portal; the bulk Mark-completed exists to clear them.

---

## 3. Job 1 tomorrow — DEPLOY (api + web together)

Per [[project-web-deploy-mechanism]] (account `e2494242…`, wrangler via
`corepack pnpm --filter @carres/api exec wrangler …`):

1. `git pull origin main` (parallel-session rule)
2. api: `wrangler deploy --env production` — carries `/operation/payments`,
   `/operation/orders/bulk-complete`, ops/tasks done-stamp
3. web: `corepack pnpm --filter @carres/web build` → grep `dist` for `SERVICE_ROLE`
   (must be clean) → `wrangler pages deploy apps/web/dist --project-name=carres-portal --branch=main`
4. Verify: 401-health on api, live bundle hash, Payments page loads, then **Jess action**:
   Orders → select the overdue legacy orders → ⋮ → **Mark completed** (clears the ~105 backlog)
5. Update CLAUDE.md §17 work-log + §17.1 (bundle hash, migration 0166, test counts) after deploy

---

## 4. Pending jobs (Jess's asks, queued)

- **P1 — Items standard format**: accessories/services tags must **always show qty**
  ("1× M.P", "1× Service", "2× Disposal") — no qty-1 exemption. Core keeps the
  single-category de-dup ("1 [SOF]").
- **P2 — Orders table compact relayout**: column order
  `CHECKBOX · STATUS · ORDER ID · DEADLINE · LOCATION · LOGISTIC · ITEMS · STOCK`,
  with the **customer name moved UNDER the SO number** in the Order ID cell (Customer
  column removed; TCF ref + phone live in the drawer/tooltip). Keep rows compact —
  do NOT grow row height.
- **P3 — Deadline default sort**: ascending by `delivery_date` (overdue/earliest first;
  TBD + undated last). Today the list is `placed_at desc`.
- **P4 — Stock ACTION filter row** (after the Region row) — **Proposal A below, agree the
  legend first**.
- **P5 — Order drawer redesign** — **Proposal B below; Jess: "we agree only you change"** —
  do NOT build until he approves.
- **P6 — Payments balance import**: extend the AutoCount import to write
  `ops_order_control.balance` from the listing's `Balance` column (it already parses
  "RM3322 Paid" → `parsePaid`). **wenwei's import door — coordinate before touching.**
- **P7 — Small data question for Jess**: a tag named "Carress" appears on SO-1146
  (free-text accessory the classifier can't name) — ask what that line is, map it properly.
- **P8 — bulk-complete route test**: `apps/api/src/routes/operation/bulk-complete.ts`
  has no test yet (CLAUDE.md §11 wants one per route; mirror `order-control.test.ts`).
- Deferred (Jess signed off earlier): Tasks email/WhatsApp alert (in-app badge only);
  Keep principal-view author names.

---

## 5. PROPOSAL A — Stock action row + legend (P4, awaiting Jess OK)

A third chip row under Region, **filtering** (stacks with status tab + Urgent + Region):

```
Stock:  [All 155]  [🟢 Ready 12]  [🟡 Waiting 96 — raise/chase PO]  [⚪ Not set 47 — check manually]
```

Legend (one caption line under the row, + tooltips on each chip):

- 🟢 **Ready** — stock secured/reserved, or free shelf stock covers every line. No action.
- 🟡 **Waiting** — short → **raise PO**, or PO already open → **chase the ETA**. ← the action bucket
- ⚪ **Not set** — can't compute (AutoCount free-text SKU not in catalog) → open the order and check.

Open question for Jess: also add a composite red **[⚠ Needs action N]** chip
(= Waiting + Not set in one click), or are the three chips enough?

---

## 6. PROPOSAL B — Order drawer redesign (P5, awaiting Jess OK)

**Critique of the current drawer** (Jess: "very messy, need every section one category,
multi-leg should be under order control, not compact"):

- Stock facts are split across TWO places (the "Stock & warehouse" card at top, the
  "Stock location / Stock ETA" chips inside Order control further down).
- The multi-leg `<details>` floats between them, orphaned from the delivery fields it
  belongs with.
- Section rhythm is inconsistent (cards vs bare labels vs chips), lots of vertical
  waste, no scan order.

**Proposed structure — 5 sections, one category each**, collapsible with the key value
summarised in the header line so a collapsed drawer still reads:

1. **ORDER** — customer + phone + address · source refs (TCF/CR) · status pill ·
   placed/import date. (Phone + ref live here now that the list dropped them.)
2. **ITEMS & STOCK** — per-line table (SKU · qty · on-hand · per-unit ids) + the same
   3-state stock pill as the list + source warehouse + stock-location chips + stock ETA.
   **All stock facts in ONE place.**
3. **DELIVERY** — logistic select (suggested-carrier default) + delivery date + time
   slot + **multi-leg route nested INSIDE as an "Advanced: route" sub-block** + POD/e-sign.
4. **PAYMENT** — total / paid / outstanding + ops `balance` + storage fee (auto + override)
   + payment status — the same row the Payments panel shows, editable here.
5. **NOTES & ACTIONS** — the 4 remark fields (customer request / action for logistic /
   Carres remark / warehouse remark) + Case/Service-Note buttons + history timeline.

**Compactness rules**: 2-column field grid · 12–13px values · section headers `.t-h4`
with the summary value right-aligned · empty sections collapsed by default · ONE pinned
action bar at the drawer bottom (no scattered buttons).

---

## 7. Conventions reminders (for the new chat)

- Commit with inline identity `git -c user.name="Chai Chiew Lim" -c user.email="limchaichiew@gmail.com"`,
  explicit paths only (never `git add -A`), Conventional Commits, end with the Claude co-author line.
- Push/deploy only on Jess's keyword (`push` / `上线`); deploy ONLY from main; pull first.
- Numbered question listings for any decision (Jess answers by number).
- The ops cockpit tables (`ops_notes` / `ops_tasks`) now hold **Jess's real data** — never
  bulk-delete as "test data"; only remove artifacts you created this turn, by exact text.
- Supabase changes via the project MCP (`mcp__supabase__apply_migration`) + a matching
  file in `supabase/migrations/` (next free number: **0167**).
