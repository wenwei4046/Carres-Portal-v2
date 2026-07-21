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

## 5. NEXT = COMPACT REDESIGN (Jess's live feedback 2026-07-21 — DO THIS FIRST)
The current cards waste vertical space (tall, empty). Make it compact:
1. **Each supplier = ONE COMPACT COLLAPSED ROW** (not a tall card): factory · category · `N units · M orders · order-by from <date>` · urgency pill · chevron. Collapsed by default = dense, no wasted space.
2. **Click a row → expands INLINE** (accordion) to the aggregated SKU lines; OR opens the right drawer. Pick inline-expand for density.
3. **Left facet items MUST filter/jump the right** — RAISE-BY SCHEDULE dates + By-factory + Needs-attention are currently DEAD (clicking 23 Jul does nothing). Wire every facet item → filter the right list + tally.
4. **REMOVE the empty white header** (the `pT` ListPageShell meta bar renders an empty white box — pass no meta / hide it).
5. Keep KPI-as-stage-switcher, Something-wrong popover, hidden-null cost.
6. Apply the SAME compact pattern to ② Chase + ③ Receive.

## 5b. OPEN (secondary, Jess to decide)
- **Model names show as code** (`L1201S`,`N1001S`) = `product_models.name` holds code-ish values → friendlier names = a CATALOG DATA edit (Jess), not a page bug.
- **Sofa splits per-compartment SKU** (`5539-*`) — decide: group a whole sofa build into ONE line (recommended) vs per-compartment.

---

## 6. LATER UNITS (approved direction)
- **NAV / IA merge — ✅ DONE 2026-07-21 (PR #241).** The 3 rails (Purchase Order / To Order / Receiving) are now ONE "Purchasing" sidebar item + a `PurchasingTabs` top bar (To Order · Purchase Orders · Receiving). `portal-nav.ts` has `tab?`/`activeFor?`; `PurchasingTabs.tsx` is the bar. OPEN follow-up: To Order's internal ②Chase/③Receive sections now overlap the Purchase Orders + Receiving tabs — decide if To Order becomes place-only or stays the full worklist. Merged item dropped the procurement unread badge (reattach if wanted).
- **Rename "Stock" → "Inventory"** (pages: Availability [lead with free = qty−reserved] · Movements). = international ERP module shape. NOT built.
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
