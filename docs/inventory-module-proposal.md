# Inventory module — full proposal (LOCKED 2026-07-22)

> Spec for the Inventory module — replaces the current `Stock · On Hand` + `Stock · Movements` sidebar items with a single `Inventory` module (SAP MM / Odoo Inventory / Shopify pattern). Locked with Jess (COO) 2026-07-22 after Excel inspection (`Klg Warehouse 20 Jul 26.xlsx` = 985 units per-unit ledger).

---

## How to resume (any machine, any new chat)

Paste this into a fresh chat:

> Continue Inventory module redesign. Read in order:
> 1. `docs/inventory-module-proposal.md` — this file, the SPEC
> 2. `docs/COPY-STANDARD.md` — microcopy rules + canonical vocabulary
> 3. `docs/UI-KIT.md` §8.2 (interaction law) + §8.3 (module-tab law) — **corrected
>    2026-07-29: `§A0` no longer exists; the kit was rewritten 2026-07-27**
> 4. `docs/PURCHASING-INFORMATION-MODEL.md` — the Purchasing information architecture,
>    frozen 2026-07-29. **This replaces the two dead pointers this list used to carry**
>    (`purchase-cockpit-handoff.md` §5 and `purchasing-3panels-proposal.md`, both DELETED
>    2026-07-27 — a chat following them was being sent to files that do not exist)
> 5. `docs/orders-panel-concept-proposal.md` — Orders sibling (same discipline)
> 6. `docs/PURCHASING-WORKING-FLOW.md` — how Purchasing behaves (the ONE flow file)
>
> Live-poke `https://erp.carresofficial.com/operation?tab=purchase` for the visual/interaction language.
>
> Start with **Phase 0 · user research** (observe 2 warehouse ops + 1 salesperson for 15 min each). Do NOT skip to Phase 1 code.

---

## Contract

- **LAYER on top of existing `Stock · On Hand` + `Stock · Movements`** — don't tear down. Merge into `Inventory` module with 4 tabs.
- Zero danger-zone breakage — `stock_balances` / `ops_stock_items` schema untouched; new tables (`sku_aliases`, `supplier_aliases`, `stock_reconciliations`) are additive.
- One PR per phase. Review + merge + deploy independently.
- Deploy only from `main` — the rule lives in `CLAUDE.md` §17.1 ("Deploy rules (Loo,
  permanent)"). *(Corrected 2026-07-29: this line pointed at `docs/purchase-cockpit-handoff.md`
  §2, deleted 2026-07-27.)*

---

## LOCKED decisions

**HARD (never touch — spec violations = revert):**

| # | Decision | Why |
|---|---|---|
| 1 | Merge `Stock · On Hand` + `Stock · Movements` into single `Inventory` sidebar item with 4 tabs | Matches Purchasing pattern (consistency); international standard (SAP MM · Odoo · Shopify) |
| 2 | 4 tabs = **On hand · Ready stock · Movements · Reconciliation** | Each answers ONE question (What do I have? · What can I sell now? · What moved? · How do book and physical differ?) |
| 3 | 4 Location types = **Own · Partner · Supplier · In-transit** | Carres reality: Klang=Own(NETS-managed); HOUZS=Partner(they own); At Ohana/Nice Future=Supplier(not yours yet); with NETS/TEOW=In-transit |
| 4 | Ready stock tab has `[Book now]` button per row | Salespersons need to reserve stock upfront for customers before PO chain — currently missing → sales lost |
| 5 | `On hand` tab shows **age indicator** on every location (green ≤3d · amber 4-14d · red >14d) | 3PL reality: stock counts have latency; be honest about it (SAP · Odoo standard) |
| 6 | Reconciliation split into **Phase 1 setup (aliases) + Phase 2 weekly ops** | 143 unknown SKUs in Excel need alias mapping BEFORE reconciliation works |
| 7 | New tables: `sku_aliases` · `supplier_aliases` · `stock_reconciliations` | Additive; doesn't touch stock_balances or ops_stock_items |

**NEGOTIABLE (Jess agree first):**

| # | Decision | Alternative |
|---|---|---|
| 8 | Book now UI = quick modal (SO # + qty → reserve fires) | Could be inline row-expand instead |
| 9 | Facet by Location type + By supplier | Could add By category + By warranty status |
| 10 | Age indicator colours (3/14/30 day thresholds) | Could tune based on operator feedback |
| 11 | Ready stock category tabs (Mattress / Sofa / Bedframe) | Could be facet only |
| 12 | Movements tab retention (2 years default) | Could be shorter for perf |

---

## Executive rating trajectory

| Point | Rating | State |
|---|---|---|
| Now | 4/10 | Stock · On Hand + Stock · Movements as separate pages; no cockpit discipline; no ready-stock reserve; no reconciliation |
| After Phase 1 (safe copy audit) | 5/10 | Vocab aligned, no structural change |
| After Phase 2 (module merge + 3-pane) | 7/10 | Cockpit discipline applied |
| After Phase 3 (Ready stock + Book now) | 8/10 | Salespersons can reserve |
| After Phase 4 (Reconciliation + aliases) | 9/10 | Book vs physical honest |
| After Phase 5 (Phase 0 findings + live-tune) | 10/10 | Only real staff usage reveals this |

---

## Full ASCII layouts

### Tab 1 · On hand · for operation

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ Inventory │ [On hand 1017 SKUs] [Ready stock 45] [Movements] [Reconciliation] │ ⟳ 🔔 ❓ ⚙  │
├──────────┬──────────────────────────────────────────────────────┬──────────────────────────┤
│ FACET    │ MIDDLE LIST                                            │ DETAIL                   │
│ (200)    │ (420)                                                  │ (fills)                  │
│          │                                                        │                          │
│ NEEDS    │ 🛏 N1001S-Q · Nice Future           ✓ 3 avail Klg      │ N1001S-Q · Queen mattress│
│  Zero 3  │ Klg 3 avail · 2 reserved · 3 incoming ⚠ 2d ago          │ Nice Future · Ready ✓    │
│  Low 8   │ Ready to promise 3 more.                                │ ─────────────────        │
│  Stale 5 │                                                        │  LOCATION      QTY RES AVL AGE│
│          │ 🛋 5539-CNR · Ohana                 ✓ 3 avail Ohana     │  Klg (Own)     5   2  3  2d 🟢│
│ BY TYPE  │ Ohana 3 avail · at supplier                             │  HOUZS (Ptr)   1   0  1  8d 🟡│
│  Own 45  │ Available at supplier only.                             │  Ohana (Sup)   0   0  0  —    │
│  Ptr 12  │                                                        │  Planned WH-2 (coming soon)   │
│  Sup 8   │ 🛏 M1201F-K · Nice Future           ❌ 0 avail           │                          │
│          │ 5 reserved · 8 incoming Fri 24 Jul                      │ RECENT MOVEMENTS         │
│ BY       │ Out of stock — arrives Fri 24 Jul.                      │ 22 Jul +3 GRN PO-84 · Ohana→Klg│
│ LOCATION │                                                        │ 21 Jul -1 Reserve SO-1204│
│  Klg 32  │                                                        │ ...                      │
│  HOUZS 5 │                                                        │                          │
│  Ohana 3 │                                                        │ WHAT TO DO (low stock)   │
│  NETS-WH │                                                        │ 1. Check open POs (2 in) │
│    (0)   │                                                        │ 2. Chase Nice Future Fri │
│          │                                                        │ 3. Warn Sales           │
└──────────┴──────────────────────────────────────────────────────┴──────────────────────────┘
```

### Tab 2 · Ready stock · for salesperson

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ [ All ready ] [ Mattress 12 ] [ Sofa 8 ] [ Bedframe 5 ] [ Accessory 2 ]                    │  Category tabs
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ 🛏 N1001S-Q · Queen mattress             ✓ 3 ready · Klg · 🟢 fresh           [ Book now ]  │
│ 🛏 M1201F-K · King mattress              ✓ 2 ready · Klg · 🟢 fresh           [ Book now ]  │
│ 🛏 M1401S-Q · Queen mattress             ✓ 1 ready · Klg · 🟡 8d old          [ Book now ]  │
│ 🛋 5539-CNR · Booqit corner              ✓ 3 ready · at Ohana · 🟢 fresh      [ Book now ]  │
│ 🛋 5539-1A · Booqit L-shape              ✓ 2 ready · at Ohana · 🟢 fresh      [ Book now ]  │
│ 🛏 JAGER-Q · Bedframe                    ✓ 1 ready · Klg · 🔴 32d old  ⚠      [ Book now ]  │
└────────────────────────────────────────────────────────────────────────────────────────────┘

Book now modal:
┌─────────────────────────────────────────────────────┐
│ Book N1001S-Q for a customer                         │
│                                                       │
│ SO number:  [ SO-1204 ▼ ]  (or type new SO)           │
│ Qty:        [ 1 ]                                     │
│ Reserve at: [ Klg ▼ ]                                 │
│                                                       │
│ [ Cancel ]                        [ Confirm reserve ] │
└─────────────────────────────────────────────────────┘
```

**Behind [ Confirm reserve ]:**
1. Validate SO exists + status ∈ (placed, proceed_order)
2. `stock_balances.reserved += qty` (transaction)
3. Log to `ops_stock_movements` (action='reserve', ref=SO#, user_id)
4. Toast: `1 unit of N1001S-Q reserved to SO-1204.`

### Tab 3 · Movements · audit log

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ [ Search SKU ] [ Date range ▼ ] [ Location ▼ ] [ Action ▼ ]                                 │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ TIME              SKU         LOCATION       ACTION       QTY   REF          USER          │
│ 22 Jul 14:30      N1001S-Q    Klg            GRN          +3    PO-84        operation@    │
│ 22 Jul 14:35      N1001S-Q    Klg            Reserve      -1    SO-1204      sales@        │
│ 22 Jul 15:12      5539-CNR    at Ohana → Klg Transfer     0     -            operation@    │
│ 21 Jul 09:00      M1201F-K    Klg            Deliver-out  -1    SO-1198      nets@         │
│ 20 Jul 16:00      Reconcile — see PS 20 Jul                                                 │
│ ...                                                                                          │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Tab 4 · Reconciliation

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ Import stock count                                                                          │
│ Last uploaded: 20 Jul · 2 days ago                    Next due: Mon 27 Jul (weekly)         │
│                                                                                              │
│ [ 📤 Upload Excel · Klg Warehouse ]                                                          │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ IMPORT PREVIEW · 985 units read from `Klg Warehouse 20 Jul 26.xlsx`                          │
│                                                                                              │
│ ✅ Auto-mapped · 780 units                                                                    │
│ ⚠  Unknown SKU (need alias) · 143 units       [ Fix aliases ▾ ]                              │
│ ⚠  Unknown supplier · 62 units                [ Map suppliers ▾ ]                            │
│                                                                                              │
│ AFTER MAPPING · DIFF vs system                                                                │
│ Category   System   Excel    Diff   Reason                                                    │
│ Mattress   145      142      -3     3 delivered not booked                                    │
│ Bedframe   430      428      -2     see detail                                                │
│ Sofa       180      185      +5     5 GRN not entered                                         │
│ Headboard  205      230      +25    25 uncounted (major — investigate)                       │
│                                                                                              │
│ [ Fix aliases first ]                                     [ Apply once all clean ]           │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ SKU ALIAS SETUP (Phase 1 · one-time setup)                                                   │
│                                                                                              │
│ Excel description                          → System SKU                                       │
│ "1013-Q JAGER BEDFRAME"                    → [ JAGER-Q       ▼ ]                             │
│ "1007-K BEDFRAME"                          → [ CODY-K        ▼ ]                             │
│ "1007Cody/Fab3-Queen/PC151-01/Divan 8"..." → [ (multi-part — auto-parse) ▼ ]                 │
│                                                                                              │
│ SUPPLIER ALIAS SETUP                                                                          │
│ Excel name                                 → System supplier                                  │
│ "Hookka"                                   → [ Ohana         ▼ ]                             │
│ "Renness"                                  → [ (new supplier) ▼ ]                            │
│ "NB"                                       → [ ??            ▼ ]                             │
│                                                                                              │
│ [ Save aliases ]                                                                              │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Data model (LOCKED · additive migrations)

**Migration 0244 · sku_aliases**

```sql
create table sku_aliases (
  id uuid primary key default gen_random_uuid(),
  excel_description text not null,
  system_sku text not null references product_skus(sku),
  parse_rules jsonb,          -- for multi-part descriptions (e.g. "SKU/Fabric-Size/Legs")
  created_at timestamptz default now(),
  updated_by uuid references salespersons(id),
  unique(excel_description)
);
```

**Migration 0245 · supplier_aliases**

```sql
create table supplier_aliases (
  id uuid primary key default gen_random_uuid(),
  excel_name text not null unique,
  system_supplier_id uuid references suppliers(id),
  created_at timestamptz default now(),
  updated_by uuid references salespersons(id)
);

-- Seed with known aliases
insert into supplier_aliases (excel_name, system_supplier_id)
  select 'Hookka', id from suppliers where name = 'Ohana' limit 1;
```

**Migration 0246 · stock_reconciliations**

```sql
create table stock_reconciliations (
  id uuid primary key default gen_random_uuid(),
  uploaded_at timestamptz default now(),
  uploaded_by uuid references salespersons(id),
  source_file text not null,               -- e.g. "Klg Warehouse 20 Jul 26.xlsx"
  count_date date not null,                -- the "as of" date from filename or header
  total_units_read int not null,
  matched_units int not null,
  unmatched_units int not null,
  status text not null check (status in ('draft','applied','discarded')),
  diff_summary jsonb,                      -- category totals · diff · reasons
  applied_at timestamptz,
  applied_by uuid references salespersons(id)
);

create table stock_reconciliation_lines (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid references stock_reconciliations(id) on delete cascade,
  excel_row_data jsonb not null,           -- the raw row
  matched_sku text references product_skus(sku),
  matched_supplier_id uuid references suppliers(id),
  system_qty_before int,
  system_qty_after int,
  status text not null check (status in ('matched','unknown_sku','unknown_supplier','applied','skipped'))
);
```

**Age indicator logic:**

```typescript
function stockAge(lastReconciledAt: Date | null): 'fresh' | 'stale' | 'outdated' {
  if (!lastReconciledAt) return 'outdated';
  const days = daysBetween(lastReconciledAt, new Date());
  if (days <= 3) return 'fresh';
  if (days <= 14) return 'stale';
  return 'outdated';
}
```

`stock_balances` gets a new column `last_reconciled_at timestamptz` in migration 0247 (nullable, additive).

---

## Location types (LOCKED)

`stock_balances.warehouse_id` FKs to `warehouses` table (exists). Add `warehouses.location_type` in migration 0248:

```sql
alter table warehouses add column
  location_type text default 'own' check (location_type in ('own', 'partner', 'supplier', 'in_transit'));

-- Seed
update warehouses set location_type = 'own'      where name ilike '%klang%';
update warehouses set location_type = 'partner'  where name ilike '%houzs%';
update warehouses set location_type = 'supplier' where name ilike '%ohana%' or name ilike '%nice future%';
```

**UI shows the type badge on every location row:** `Klg (Own)` · `HOUZS (Partner)` · `Ohana (Supplier)`.

---

## Executable phases

- **Phase 0** (~1h · RESEARCH before any code)
  - Watch 2 warehouse ops + 1 salesperson for 15 min each
  - Ask 5 exact questions: (1) How do you check what's in stock today? (2) What do you do when Book stock ≠ actual? (3) How often do you upload Excel and how? (4) What confuses you about current On Hand page? (5) If salesperson could reserve directly, what would break?
  - Write `docs/inventory-phase-0-findings.md`
  - **Success criteria:** ≥3 assumption confirmations OR challenges to LOCKED decisions

- **Phase 1** (~2h + 2h review) — copy audit + vocab alignment. Rename sidebar `Stock · On Hand` → `Inventory · On hand`; `Stock · Movements` → `Inventory · Movements`. Add module tab bar `InventoryTabs`. No structural change.

- **Phase 2** (~4h + 3h review) — 3-pane inline split for On hand tab. Add facet (Needs / By type / By location). Add row action-line. Add What-to-do per state (low stock / zero / stale).

- **Phase 3** (~3h + 2h review) — Ready stock tab + Book now modal. Migration 0244 (sku_aliases only — not fully populated yet). Category tabs.

- **Phase 4** (~4h + 3h review) — Reconciliation tab. Migrations 0245-0248. Excel upload + parse + alias-map + diff view + apply RPC. This is the biggest phase — includes SKU/supplier alias setup UI.

- **Phase 5** (~2h + 2h review) — Age indicator on all On hand / Ready stock cells. Anti-stale nudge banner. Weekly reconciliation reminder. Phase 0 findings fixes.

**Total: ~26h impl + 12h review = ~38h across 5-6 weeks · 5 PRs · Inventory 4/10 → 9/10.**

---

## Critical self-audit · rating 7/10

### Real gaps

| # | Gap | Risk | Fix |
|---|---|---|---|
| 1 | Phase 0 skipped in past — did we watch anyone? | Design might miss real workflow | Do Phase 0 before Phase 1 · non-negotiable |
| 2 | 985-row Excel · 143 unknown SKUs · alias setup UI could be tedious | Operators drop off during setup, reconciliation never launches | Build a bulk-import CSV for aliases; auto-suggest closest match; batch approve |
| 3 | Ready stock `[Book now]` needs SO to exist first — chicken/egg during POS quote | Salesperson makes quote then wants to reserve stock BEFORE SO ID exists | Allow reserve on TCF (tentative customer form) with `so_pending=true`; auto-link when SO created |
| 4 | Location type "in-transit" — units are DYNAMIC (with NETS driver, at TEOW WH temporarily) — hard to model as a fixed `warehouse` row | Data model breaks | Represent in-transit as `movement` events between fixed warehouses, not as its own warehouse. Only Own/Partner/Supplier are `warehouse` rows. |
| 5 | Reconciliation Excel upload — parse rules for multi-part descriptions (`"1007Cody/Fab3-Queen/PC151-01/Divan 8"/Leg 2"/Gap12"`) is complex | Wrong parse → wrong SKU → wrong adjust | Ship a parse-rule sandbox first (test on 10 examples, tune) BEFORE running full 985-row diff |
| 6 | Weekly reconciliation cadence assumes weekly; what if 3PL provides daily? | Miss opportunity for tighter accuracy | Configurable cadence per location |
| 7 | Ready stock `age` indicator green/amber/red thresholds (3/14/30) are guesses | Might not match real ops feel | Tune post-Phase 0 based on staff feedback |
| 8 | Book now doesn't check payment status | Salesperson reserves stock for customer who hasn't paid deposit; stock locked, cash not received | Add `payment_status` check; if `no_payment` show warning "customer hasn't paid — reserve anyway?" |

### Solutions to lift 7 → 9/10

- **Solution A · Phase 0 non-skip** (Fix 1)
- **Solution B · Parse-rule sandbox** (Fix 5)
- **Solution C · Bulk-import CSV for aliases + closest-match auto-suggest** (Fix 2)
- **Solution D · Payment-gate on Book now** (Fix 8)

Rated after these: 9/10.
Rated after 2 weeks live-usage feedback: 10/10 (only real staff usage reveals it).

---

## Critical gaps found post-review (LOCKED update 2026-07-22 late round · lifts 7→9/10)

Doc was rated 7/10 initially. Below are the 8 real gaps that HAVE to be spec'd before Phase 1 or the module ships broken.

| # | Gap | Fix (add to appropriate Phase) |
|---|---|---|
| 1 | **Multi-part description parser** — "1007Cody/Fab3-Queen/PC151-01/Divan 8"/Leg 2"/Gap12"" needs sophisticated parser, not "auto-parse" | **Phase 4a**: build parse-rule DSL (regex or slash-split). Sandbox tester runs on 20 real Excel lines. Must pass before running full 985-row diff. |
| 2 | **`stock_balances` (SKU-level) vs `ops_stock_items` (per-unit) sync** — 2 tables, unclear which drives which UI | **Phase 2b**: data-model diagram in doc. `ops_stock_items` = ground truth. `stock_balances` = rollup materialized view (`select sku, warehouse_id, count(*) filter (where free) as available, count(*) filter (where reserved) as reserved from ops_stock_items group by`). Reconciliation writes to `ops_stock_items` then refreshes the view. |
| 3 | **`Book now` at non-Own location** — reserving at `at Ohana` doesn't = customer gets it Monday | **Phase 3**: add `warehouses.is_immediately_deliverable` boolean (Own = true, Partner may be true, Supplier = false, In-transit = false). Book now warns operator: `Stock at Ohana — needs pickup before delivery. Confirm reserve?` |
| 4 | **No mobile view** — warehouse staff use phones to count | **Phase 2**: responsive rules. `<900px` = single-column card list, facet collapses to bottom-sheet. |
| 5 | **Return-to-supplier flow** (defective units) missing entirely | **Phase 5b (new)**: unit detail has `[ Send back ]` action → logs `stock_movements(action='return_to_supplier', reason=...)` + updates `ops_stock_items.condition='returned'` |
| 6 | **Age indicator baseline chicken/egg** — how do we know last-reconciled-at before first reconciliation? | **Phase 1**: `stock_balances.last_reconciled_at` defaults to `GRN date` (first-time GRN = baseline). Before first reconciliation, show `⚪ never reconciled` grey. |
| 7 | **Alias setup UX for 143 unknown SKUs** — tedious, operators drop off, feature never launches | **Phase 4b (new)**: bulk CSV template + closest-match auto-suggest (Levenshtein distance) + `[ Approve all matching ]` bulk button. Setup time from ~2h → ~15min. |
| 8 | **NETS-managed warehouse real-time feedback** — how does NETS report deliveries back to us? | **Phase 4c (new)**: NETS integration spec — webhook OR daily CSV feed pull. Phase 0 confirms which one NETS can actually provide. |

**Revised phase totals:** ~30h impl + 14h review = ~44h across 6-7 weeks · 5+ PRs · Inventory 4/10 → 9/10.

---

## Anti-drift note for next chat

If a fresh chat reads this and thinks any LOCKED decision is wrong:
1. HARD-locked → ASK Jess in chat first
2. NEGOTIABLE-locked → open a doc-amendment PR with new reasoning
3. NOT silently redesign

Reference the LOCKED # when proposing a change.
