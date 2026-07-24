# CHECKPOINT · Purchase cockpit (To Order) · 2026-07-23

> Paste this whole file as the FIRST message in the new chat. It carries every
> locked decision + what's built + what's left, so you never re-explain.
> **Owner = Jess (COO). Only Jess comments; complete all agreed before asking.**

---

## 0. HOW TO WORK (Jess's rules — obey)
- English tech terms preserved (Supabase / Hono / RLS / JWT / RPC / PO / SO / GRN).
- **UI copy = English only.** Numbers/codes = JetBrains Mono slashed-zero.
- Follow `docs/UI-KIT.md` v4 (pills not emoji · one flame button per page · 44px rows · cool canvas). Load the `carres-design` skill before UI work.
- Microcopy standard = NN/g + GOV.UK + Shopify Polaris + SAP Fiori (plain words, one word per concept — never use "order" as both noun and verb on one card).
- **COMPLETE all agreed in one go — do NOT hand decisions back / do NOT stop to ask.** Jess only comments.
- Commit with explicit paths (never `git add -A`). **Do NOT push / deploy until Jess says `上线`.** Migrations: draft first, check remote tail, apply only on Jess's OK (shared prod DB).
- ASCII mock first for any NEW design; then code.

## 1. WHERE THE CODE IS
- Branch **`feat/purchase-cockpit-2026-07-23`** (off `feat/orders-drawer` @ `9a9875d1` = origin/main tip). **NOT pushed.**
- Commits: `349b62bc` (engine + route) · `81f7adc4` (self-contained cards) · `6e2bfd94` (PO date on card + Lead Times modal). Plus earlier working-tree docs.
- Dev server: `web-standard` (port 5188) hits **prod** Supabase + Worker. Login `operation@carres.com` / `111`.
- All tsc clean (web/api/shared 0). shared tests **924/924**. api 2 pre-existing purchase.test `forOrders` fails (deliveryDate shape — NOT mine, on branch before my work) + §17.7 baseline.

## 2. LOCKED BUSINESS DECISIONS (this session — do NOT re-derive)
### 2.1 Ordering model
- **Proceed = ASAP, NO hold.** On a sales order landing, suggest ordering NOW (next **Carres** working day). NOT batched to Mon/Wed/Fri. The date math only sorts urgency + flags "late".
- **PO date = customer deadline − 7-working-day arrival buffer − lead.** Buffer editable (default 7). Stock must ARRIVE 7 working days before the deadline (time to arrange delivery).
- **Off-day/holiday rounding for SEND dates = move EARLIER** (Mon holiday → prev Fri), never later.
### 2.2 Lead times (working days) + work weeks
- Mattress **5–7** · Bedframe **5–7** · Sofa **14 official / ~10 actual** (supplier now sends in 10). Engine currently uses **mattress 7 · bedframe 7 · sofa 10**.
- **Two work weeks:** **Carres (us) = 5-day Mon–Fri** (sends PO / GRN / arranges delivery — options.offDays). **Suppliers = Ohana 6-day (works Sat) · Nice Future 5-day (no Sat)** — drives the make+deliver LEAD (per-line offDays).
- Peak OFF (never auto-pad).
- **Lead-time table = migration 0243** (draft below, NOT applied) — `lead_time_config` (category × supplier × official/actual) + `suppliers.work_week` + editable buffer.
### 2.3 Delivery routing (from `docs/master-sheet-operating-model.md §4` — the authority)
- Carrier choice drives BOTH delivery AND upstream stock staging. `Stock Location` is multi-valued.
- 8 carriers: NETS (main + runs Carres Klang WH) · AL (Sg Buloh, 2-trips = expensive) · HOUZS (Balakong, delivers all-Malaysia but not always available) · TT/TEOW (JB) · SSY/EU (SG) · TSDD (last resort). HOOKKA = supplier OHANA, NOT a carrier.
- 3 staging patterns: ① Klang-collect (NETS/TT/TEOW) · ② Sg-Buloh/Balakong (AL/HOUZS won't come to Klang — mattress: HOUZS piggybacks Nice Future → Balakong → AL collects; sofa: AL direct from OHANA) · ③ push-to-partner-WH (SSY/EU for SG).
- **When Order route is updated → auto-relate to Purchasing's RECEIVE/staging only** (not the buy content). AUTO HOUZS pickup = piggyback (free) when HOUZS goes to Nice Future; if not + urgent → pay extra separate logistics.
- **PayHold blocks DELIVERY only, NEVER the PO.** (Buy the goods regardless; hold delivery until paid.)
### 2.4 PO duty (already-built 0236 system)
- 货合买: ONE person controls company-wide POs per month, auto-rotating. **Jul = Shasha** → Aug Li Ching → Sep Khor Yee. PO days Mon+Thu. Urgent bypass. Managers override. Read via `/api/operation/po-duty`.

## 3. THE AGREED To Order DESIGN (the ASCII we locked)
Every panel = numbered life-circle worklist (①②③…) + SAME right rail **Team · Calendar · Flag · Activity** (content adapts). See memory `project_panel_lifecycle_pattern`.
```
Facet: Needs attention · Today's work ①Send ②Chase ③Receive · By factory
Tab bar: To Order | Purchase Orders | Receiving   [Lead times] [PO duty·Jul: Shasha]
Self-contained CARD per supplier:
  Ohana — Sofa                              5 sales orders
  [Late]  Send PO to Ohana today — 1d late.      Send by Wed 22 Jul
  Stock to: Carres Klang · NETS pickup                    RM 12,400 ⌄
  ✓ SF02 · 3-seat   buy 6   Carres Klang · NETS
  ✓ SF07 · L-shape  buy 3   Carres Klang · NETS   [Special route]  ← NOT DONE (needs backend)
  ☐ SF09 · 2-seat   [On hold]                     ← NOT DONE (needs backend)
  3 of 3 selected                              [ Send PO ]
Right rail Team = PO duty board (Shasha ★).
```

## 4. DONE (live-verified on the dev app)
- ✅ Engine: arrival buffer + per-supplier work week + bed-set earliest leg (TDD, `net-requirements.ts`).
- ✅ Route: buffer 7 + per-category supplier week; **corrects `daf06588`** (it had wrongly forced the whole engine to 5-day). Lead numbers 7/7/10.
- ✅ Cards self-contained: header (supplier — category · N sales orders) · status pill · ASAP "today" action · **Send by <date>** · Stock-to line · per-SKU `✓ buy N · destination` rows · `N of N selected` · **Send PO on the card** (shared `buildPlacePrefill`). Header also expands the full SKU/size/deadline table.
- ✅ **PO duty · Jul: Shasha** chip in the tab bar.
- ✅ **Lead Times** settings modal (tab-bar button) — shows buffer 7 + make/deliver 7/7/10 (read-only until 0243).

## 5. NOT DONE / OPEN (do these in the new chat)
1. **Deploy** engine+route to the Worker → the cards' dates then use the buffer model (now still show prod's OLD dates). **Needs Jess `上线`.**
2. **Migration 0243** `lead_time_config` + `suppliers.work_week` + editable buffer → makes Lead Times editable/persistent + per-supplier. **Draft first, check tail, Jess OK to apply.**
3. **Per-line `Special route` + `On hold`** on cards — need backend fields (per-line route + a hold flag). Not in the API response yet.
4. **Cross-panel linking** (Orders ↔ Purchase ↔ Stock ↔ Payments ↔ order detail hub). Approach: the order-detail is the hub; each panel row/card links to the SO; the Order's assigned route auto-relates to Purchase Receive staging (§2.3). Larger piece, not started.
5. **VERIFY: "click ① Send POs → Nice Future card missing?"** Expected: Nice Future = its own card + own Send PO (one PO per supplier). Confirm the card actually renders in the ① Send list; if a filter hides it, fix. (Screenshots this session DID show the Nice Future mattress card — re-check with Jess what she saw.)
6. Chase / Receive stages still use the old list+detail split (only Place = cards). Convert if Jess wants consistency.

## 6. 0243 MIGRATION DRAFT (chat only — NOT on disk; re-check prod tail before numbering)
```sql
alter table suppliers add column work_week int not null default 6 check (work_week in (5,6));
update suppliers set work_week = 5 where name ilike '%nice future%';
create table lead_time_config (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('mattress','bedframe','sofa')),
  supplier_id uuid null references suppliers(id) on delete cascade,   -- null = category default
  official_days int not null check (official_days between 1 and 60),  -- order-early
  actual_days   int not null check (actual_days between 1 and 60),    -- tell customer
  updated_by uuid references app_users(id), updated_at timestamptz default now(),
  unique (category, supplier_id)
);
-- + an arrival_buffer_days singleton setting (7). RLS: internal read; operation+principal write.
insert into lead_time_config (category, official_days, actual_days) values
  ('mattress',7,5), ('bedframe',7,5), ('sofa',14,10);
```

## 7. FILES TOUCHED
- `packages/shared/src/net-requirements.ts` (+ `.test.ts`) — buffer / per-line offDays / earliest-leg.
- `apps/api/src/routes/operation/purchase.ts` — lead numbers · SUPPLIER_OFF_DAYS · ARRIVAL_BUFFER_WORKING_DAYS · buffer wired.
- `apps/web/src/pages/operation/OperationPurchase.tsx` — ASAP action line · self-contained cards · PO date · PO duty chip · Lead Times modal · `buildPlacePrefill`.
- `docs/carres-portal-system-architecture.md §3.2` — lead numbers corrected.

## 8. FIRST STEPS IN THE NEW CHAT
1. `git fetch`; confirm on `feat/purchase-cockpit-2026-07-23`; `pnpm --filter @carres/web dev --port 5188`; login → `/operation?tab=purchase`.
2. Ask Jess: deploy now (`上线`)? apply 0243? which open item (§5) first?
3. Reference memory: `project_purchase_mrp`, `project_panel_lifecycle_pattern`, `reference_delivery_routing_al_houzs`.
