# Purchase Cockpit — HANDOFF (resume here)

> Written 2026-07-21 (MacBook session) so it can continue on the OFFICE DESKTOP
> tomorrow. Everything below is the single source of truth for the Purchase /
> Procurement cockpit. Owner: Jess (COO).

---

## 0. HOW TO RESUME (office desktop, new chat)

1. `git fetch && git pull origin main` (the shipped code is on `main`).
2. Read this file + `docs/purchase-procurement-plan.md` + the memory note
   `project-purchase-mrp` (memory is MacBook-local, so THIS repo doc is the
   cross-machine truth).
3. Paste this into the new chat to resume:
   > "Continue the Purchase cockpit. Read docs/purchase-cockpit-handoff.md +
   > docs/purchase-procurement-plan.md first. We're at §5 'NEXT' — the COMPACT
   > redesign. Don't ping-pong questions; lead with decisions. UI mock via ASCII,
   > then real code, then live-verify with an operation JWT before I look. Only
   > push/deploy when I say."
4. Work branch = `feat/purchase-mrp-engine` (already on origin). The engine files
   are also merged to `main` (deployed).

---

## 1. WHAT IT IS

The Operation **Purchase** page = a guided **worklist / work-queue** (NOT kanban)
that tells a no-experience operator what to buy TODAY, netted against stock +
open POs, and guides them step by step. Pattern = **faceted list + master-detail**
(SAP-Fiori style): KPI cards pick the stage, the left facet filters, the right
shows one stage, a drawer shows the detail.

Reachable: **erp.carresofficial.com → Operations → Purchase** (`/operation?tab=purchase`).
NOTE it sits NEXT TO "Purchase Order" (the old per-supplier PO register) — the two
will merge (see §6 nav plan).

---

## 2. LIVE STATE (deployed 2026-07-21)

- **API Worker** `b65e3d74` — `GET /api/operation/purchase/today` (operation+principal, userClient/RLS, read-only).
- **Web** `index-BYO7UQXF.js` on erp + pos + carres-portal.pages.dev.
- **On `main`** via PRs #237 / #238 (500 hotfix) / #239 (scale rebuild); main tip `997ad07f`.
- Branch `feat/purchase-mrp-engine`: 6 commits (engine → endpoint → page → name+cost+buttons → chase+receive → supplier-grouped rebuild). Working tree CLEAN. Nothing uncommitted.
- **Live-verified** with a real operation JWT: placeGroups = 2 supplier groups on Jess's 5 test orders (SO-1203..1207).

### Verify command (ALWAYS run before declaring an endpoint change done — mocked tests miss PostgREST FK/embed errors)
```
operation@carres.com / 111  → Supabase auth (anon key via MCP get_publishable_keys)
→ curl GET https://carres-portal-v2-api.wwch.workers.dev/api/operation/purchase/today  with Bearer <jwt>
```

### Deploy procedure + LESSONS
- Deploy ONLY from `main` (never a feature branch). Merge branch→main first.
- Deploy = API `wrangler deploy` (from `apps/api`) + web build + `wrangler pages deploy dist --project-name=carres-portal` AND `--project-name=carres-pos` `--branch=main`.
- **LESSON 1**: after `git pull` in the `main-deploy` worktree, run `pnpm install` BEFORE deploying — else wrangler bundles STALE `@carres/shared` (placeGroups came back null the first time). 
- **LESSON 2**: custom-domain edge cache lags ~10-15s after deploy — re-curl the canonical for the new `index-*.js` before telling Jess.
- **LESSON 3**: no FK on `order_lines.sku` → never PostgREST-embed `order_lines(...product_skus(...))` (it 500s live); do a 2nd `product_skus` read by sku.

---

## 3. KEY FILES
- `packages/shared/src/net-requirements.ts` — pure MRP engine (TDD).
- `packages/shared/src/purchase-report.ts` — response schema + shaper (`buildPurchaseTodayReport`, `buildPurchaseChaseReceive`), incl. `placeGroups`.
- `packages/shared/src/working-days.ts` + `my-holidays.ts` — working-day date math.
- `apps/api/src/routes/operation/purchase.ts` — the GET /today route.
- `apps/web/src/pages/operation/OperationPurchase.tsx` — the page.
- `apps/web/src/pages/portal/portal-nav.ts` — nav (label "Purchase" vs "Purchase Order").

---

## 4. LOCKED BUSINESS DECISIONS (Jess)
- **Order-driven make-to-order** (sofa/bedframe/mattress). Free stock is NOT auto-consumed (label safety, no WMS) — advisory only; `consumeFreeStock` off.
- **Open POs ARE netted** (no double-order across cycles).
- **Bed-set** (mattress+bedframe of one order) = ONE delivery bundle, raise-by = deadline − MAX(the two leads); **sofa** = its own PO/trip.
- **Cadence** = fixed per-supplier review days (default Mon/Wed/Fri) + urgent off-cycle expedite; system SUGGESTS, human confirms (never auto-places).
- **Leads** (working days, editable): sofa 14 / bedframe 8 / mattress 10; peak OFF (never auto-pad); a lead-time settings table = migration 0243 (LATER, draft-first per guardrail #8).
- **Buttons are STUBS** — Send order / Chase / Check-into-Klg don't execute yet (PO-raise / WhatsApp / GRN write = later units).

---

## 5. LOCKED DESIGN (Jess 2026-07-22 · supersedes the earlier COMPACT REDESIGN brief)

Full redesign specified below. All UI text follows **[`docs/COPY-STANDARD.md`](./COPY-STANDARD.md)** — read it BEFORE writing any string. Header rule (drop breadcrumb + big title on module-tab pages) is in `docs/UI-KIT.md` "Module-tab law".

### 5.1 Layout — 3-pane inline split (uses width, saves height)

Desktop ~1440. One screen, operator never navigates away.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ [ To Order ] Purchase Orders  Receiving          Today · Wed 22 Jul  ⟳        │  ← PurchasingTabs (module label);
│                                                                                │    freshness + refresh at right
├───────────────────────────────────────────────────────────────────────────────┤
│ [ ① SEND 8 ]   [ ② CHASE 5 ]   [ ③ RECEIVE 3 ]                                 │  ← KPI cards = stage switcher
│ DAYS TO ORDER (next 14 · click a day to focus)                                 │
│ Mon Tue Wed Thu Fri Sat Sun Mon Tue Wed Thu Fri Sat Sun                        │
│ ● 1 ● 1 ●●●  —  ●●   —   —  ● 1  —  ●●●●  —   —   —   —                        │
│ Today: 3 to send. 2 are late.                                                  │  ← auto-updated lead line
├─────────────┬──────────────────────┬──────────────────────────────────────────┤
│ FACET       │ SUPPLIER LIST        │ DETAIL (selected supplier)               │
│ 200px       │ 380px                │ ~840px, fills vertical                   │
│             │ 28px per row         │ SKU table + "What to do" 4-step block    │
│ Needs attn  │ ≤ 15 rows/day        │                                          │
│ Today's work│ NO pagination        │                                          │
│ By factory  │ NO search            │                                          │
└─────────────┴──────────────────────┴──────────────────────────────────────────┘
```

Header does NOT repeat "To Order" as a breadcrumb or big title — the tab is the title. Detail pane is ALWAYS visible (no drawer overlaying the list).

### 5.2 Three-stage vocabulary (aligned with Orders panel)

| # | Stage | Meaning | Row action-line example |
|---|-------|---------|-------------------------|
| ① | **Send** | Raise a PO to the factory. Source = Orders in **Proceed** state where no open PO covers the need. | `Send order to Ohana today.` |
| ② | **Chase** | Follow up an open PO. Row copy adapts: pre-due = **Remind**, on-due or late = **Chase**. | `Remind Nice Future — PO-86 due Fri.` · `Chase Ohana — PO-88 late 2 days.` |
| ③ | **Receive** | Goods arrived at the warehouse, check them in. | `Check in from Ohana (3 items).` |

**Why "Send", not "Place":** the Orders panel already uses **Placed** for the pre-Proceed state (customer ordered, ETA not yet confirmed). Purchase ① fires AFTER Sales clicks Proceed. Calling it "Place" would collide. "Send" is one verb, matches the module name "To Order", and follows COPY-STANDARD rule 1 (verb + object). Vocabulary table lives in `docs/COPY-STANDARD.md` — grep it before inventing a new word.

### 5.3 Left facet — every item must filter the right

Facet groups:

- **NEEDS ATTENTION** — Overdue · Missing deadline
- **TODAY'S WORK** — ① Send · ② Chase · ③ Receive (stage switch, mirrors the KPI cards)
- **BY FACTORY** — one row per factory in the active stage, with unit count

Every click MUST (a) filter the middle list and (b) update its own tally. A row of active-filter chips + `Clear all` appears above the middle list when any facet is active.

The old fuzzy buckets (This week / Next week / Later) are **retired** — replaced by the 14-day date strip (§5.4). "Specific dates only, never fuzzy buckets" is a COPY-STANDARD principle (rule 9: zero jargon → also applies to fuzzy time words).

### 5.4 Days-to-order date strip

14 consecutive days from today, one column per day.

- **Cell content**: `● N` — N units to send that day (dots if ≤ 5, then a count).
- **Cell status line**: `LATE` · `TODAY` · `due` · `—` (empty day).
- **Interaction**: click a day = filter the middle list to suppliers whose earliest `order-by` equals that day. Click again to clear.
- **Lead line under the strip**: one short sentence, auto-updated daily. Format:
  `Today: <N> to send. <M> are late.` (≤10 words, per row action-line rule).

### 5.5 Cadence — Monday-anchor consolidation (Period Lot Sizing)

Suppliers get PO windows on Mon / Wed / Fri. **Monday is the anchor day; Wed and Fri fire ONLY when a deadline cannot wait to next Monday.** Fewer touches → bigger POs → better supplier terms → less admin load. International name: SAP MM "Fixed Period Requirements" (FPR) · Odoo "Purchase Agreement + Scheduled Order".

Algorithm (server-side, exposed as a short header block above the date strip):

```
For each supplier's pending need:
  lead_time    = suppliers.lead_days (working days)
  latest_safe  = customer_deadline − lead_time  (working days back)

  if latest_safe >= next_monday:
      bucket = "Mon"        # consolidate to the anchor
  else:
      bucket = nearest safe day among {today, Wed, Fri}

Header block:
  This week's plan:
    Mon 27 Jul  ● 3 factories to order   (main day)
    Wed 29 Jul  — skip (nothing forces it)
    Fri 31 Jul  ● 1 factory (SO-1207 deadline Sat)
```

The operator does not do this math — the system does. He just reads the plan and executes.

### 5.6 Row action-line + "What to do" steps

Every middle-list row ends with one plain-English action-line (≤10 words). Every detail pane shows a 3–4 step "What to do" block below the SKU table (each step ≤8 words, one verb per step). Templates + examples live in **`docs/COPY-STANDARD.md`** — do not duplicate them here.

### 5.7 Scale — 1000 orders/month, max 15 suppliers/day

Confirmed with Jess 2026-07-22. **15 rows × 28px = 420px in the middle list → no pagination, no search, no virtualization.** The facet's "By factory" group IS the search equivalent. Revisit only when a real day exceeds 20 suppliers.

### 5.8 Retained from the earlier cut

- KPI cards ARE the stage switcher — do not add a separate `<Tabs>` component.
- "Something wrong?" popover on the detail pane stays (surfaces exceptions to the ledger).
- Hide the cost column entirely when all values are null (COPY-STANDARD rule 4: skip the obvious).
- Every write button remains a STUB (see §4). PO-raise / WhatsApp send / GRN write = later units (§6).

## 5b. OPEN (secondary, Jess to decide)
- **Model names show as code** (`L1201S`,`N1001S`) = `product_models.name` holds code-ish values → friendlier names = a CATALOG DATA edit (Jess), not a page bug.
- **Sofa splits per-compartment SKU** (`5539-*`) — decide: group a whole sofa build into ONE line (recommended) vs per-compartment.

---

## 6. LATER UNITS (approved direction, not built)
- **NAV / IA merge (approved "A")**: fold Purchase + Purchase Order + Receiving into ONE "Purchasing" module (tabs: To Order / Purchase Orders / Receiving). Rename "Stock" → "Inventory" (pages: Availability [lead with free = qty−reserved] · Movements). = international ERP module shape.
- **POS ready-stock badge**: salesperson at POS sees per-SKU available stock ("✓ 3 ready · Klg") to promise fast for urgent orders — needs a controlled per-SKU available read exposed to POS (RLS-safe, not the whole stock table). Makes ready-stock-first usable.
- **Wire the real button actions**: Send order → create a PO (currently the old "Purchase Order" page's job); Chase → real WhatsApp send + record; Check-into-Klg → real GRN write.
- **Lead-time settings screen** (migration 0243): principal edits per-supplier normal/peak leads + review days.

---

## 7. WORKING RULES (Jess)
- Lead with DECISIONS, don't ping-pong questions.
- No HTML mocks (token waste) — ASCII layout → real code → live-verify.
- Plain words, no jargon (she flagged "MRP"). English UI copy; UI-KIT v4; chips/pills; no emoji.
- Design for 500+ orders/month, 1000+ SKUs — everything must stay compact at scale.
- Never touch prod DB directly (prepare SQL for Jess); commit locally with explicit paths (never `git add -A`); push/deploy ONLY when Jess says; deploy only from `main`.
