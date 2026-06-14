# Master Sheet → Portal — Operating Model & Plan

> **Status:** DRAFT for Loo review (2026-06-08). No code yet — this is the alignment
> artifact. It captures the real operating model behind `Carres_Master.xlsx` and the
> plan to grow the Portal's **AutoCount Inbox** into the single control center that
> replaces that Google Sheet.
>
> **Companion docs:**
> - `docs/autocount-import-contract.md` — the import *door* (built + live). This doc
>   is the *what-happens-after-import* picture.
> - Source workbook reviewed: `Carres_Master.xlsx` (15 tabs, read 2026-06-08).

---

## 0. The one-line thesis

The AutoCount **Inbox is not a triage inbox** — Loo's intent is that it becomes the
**electronic Master Sheet**: the one control grid where operation runs every order
from *import → procurement → stock → schedule → delivery → payment*. Today the Portal
Inbox implements roughly **5%** of that (only "assign a logistic partner").

---

## 1. Why this exists (context, confirmed with Loo)

- Real Carres operation **does not start in the Portal — it starts in AutoCount**
  (the accounting system). Sales are keyed there; AutoCount auto-creates PO numbers
  and counts items.
- **Today:** operation exports an AutoCount "listing" (Excel) → pastes into the
  `Carres_Master` Google Sheet → controls *everything* there (logistic assignment,
  stock location, delivery scheduling, balance, issues).
- **Long-term:** customers fill their own Sales Orders directly in the Portal.
- **The bridge (now):** we keep using AutoCount. `Import → Inbox` is the bridge, and
  **that Inbox must do everything the Master Sheet does.**

---

## 2. The operating model (lifecycle) — confirmed 2026-06-08 ("基本都对")

1. **AutoCount → Import** — capture Import Date, Ref, customer, phone, address, items.
   Ref types: `RF` (ready stock), `CR` (Carres PJ showroom — mattress/bedframe),
   `TCF` (sofa), `DL` (dealer). One order can merge multiple refs (`CR0689 + CR1013`).
2. **Item explosion** — each order's items split into:
   - **Core goods**: `MS` (mattress) / `BF` (bed frame) / `SOF` (sofa) → need POs + stock tracking
   - **Accessory / service**: Pillow / `M.P` (mattress protector) / Service (e.g. *No Lift Per Floor Charge*)
   - `Item Detail` = the fully-expanded SKU list
3. **PO / Goods Receipt (GRN)** — core goods raise POs to suppliers (`PO/2604-006`);
   one order → many POs. Each item carries a `Stock Status` (→ Received on receipt).
4. **Stock readiness** — `Stock` = Ready / Not Ready · `Stock Location` = KLG / HOUZS /
   NETS / GAI · `Stock ETA` / `Pending ETA` = when out-of-stock items arrive.
5. **Assign logistic** — NETS / TSDD / AL / HOUZS / GAI / HOOKKA / TEOW / TT.
6. **Schedule** — `ETA` (customer's wanted date) + `Logistic ETA` (actual scheduled
   delivery) + `Time` (slot) + `Before 7 Days` (prep flag, 7 days before ETA).
7. **Three layers of notes** — `Customer Request` · `Action For Logistic` (e.g. "call
   cust first") · `Carres Remark` (internal, e.g. "take ready stock / swap with CR0864")
   · `Warehouse Remark`. Plus `Issue / Issue Status` + `SN / PR No` (service / problem).
8. **Deliver** — `Logistic Remark`: Pending Logistic → Done Schedule → Completed;
   `Job` 0/1; completed rows move to **Achieved**.
9. **Collect** — `Balance` (RM owing) + `Storage Fees` (MS/BF + SOF) + `Payment Status`
   (Paid / Follow Up Balance / No Stock ETA yet…).

---

## 3. Master Sheet anatomy (15 tabs)

| Tab | Role |
|---|---|
| **Stock summary** | Accessory/service stock levels (Pillow, M.P King/Queen): Opening · In · Out · Current · Low |
| **Achieved** | Completed-order archive (~164 rows of "Completed") |
| **Dashboard** | KPIs: active total (182), by-logistic split (NETS 175…), stock-not-ready (18), on-time/late, Outstation (9) |
| **GRN** | Goods-receipt register — the list of PO numbers |
| **Ops** | **The master grid** — ~9000 rows, **one row per SKU line** + every operational field (see below) |
| **Delivery_Sum** | Delivery summary — one row per order |
| **NETS / TSDD / HOUZS / AL / HOOKKA / GAI / TEOW / TT** | Per-logistic-partner work-order sheets (same columns, filtered to that partner) |
| **Balance** | Outstanding payment + storage fees + payment status per customer |

**The `Ops` grid columns (the control surface to replicate):**
`Job · Assign Logistic · Import Date · Ref · Delivery Location · ETA · Stock · Before 7
Days · Stock Pending ETA · Core Item QTY · MS/BF/SOF · Pillow/M.P/Service · Logistic
Remark · Logistic ETA · Time · Customer Request · Action For Logistic · Carres Remark ·
Warehouse Remark · SN No · PR No · Issue · Issue Status · Stock Location · Stock Status ·
Stock ETA · Item Size · Item Group · Qty · Item Detail · PO · Customer · Phone · Add 1–4 ·
Balance · MS/BF Storage Fees · SOF Storage Fees · Payment Status`

> **Key insight:** `Ops` is **per-item** (each SKU line = its own row, with Item Size
> K/Q/S, Qty, its PO, its Stock Status/Location/ETA). This is *why* Loo asked for
> **per-unit receive** — operation already manages goods item-by-item. The earlier
> "逐件收货" feature is one cell (`Stock Status`) of this grid.

---

## 4. Warehouse & logistics model — confirmed 2026-06-08 (Jess)

**Since 1 June 2026 Carres has ONE own warehouse: Carres Klang.** NETS rents & manages it
(Jess pays NETS). *(Legacy, pre-1-June: no warehouse — suppliers sent sofa directly to HOUZS's
place at Balakong, which delivered. Retired now; everything goes through Carres Klang. So the
earlier draft's "HOUZS transfer / HOUZS direct pickup" is void.)*

**Inbound — all stock consolidates at Carres Klang first:**
- **Nice Future** → **NETS picks up** → Carres Klang  (`factory_pickup`, procurement partner = NETS)
- **Other suppliers** → **deliver direct** to Carres Klang  (`own_logistics`)

**Outbound — carrier chosen by destination region:**

| Destination | Carrier(s) | Notes |
|---|---|---|
| Klang Valley | **NETS** (main) | AL / HOUZS also possible but **expensive** (backup) |
| North outstation — Taiping / Ipoh / Penang | **NETS** | |
| Melaka & Johor | **TT or TEOW** (JB logistics) | pick up from Carres Klang → transit JB → deliver |
| Singapore | **SSY or EU** (JB logistics) | SG customers only |
| Other outstation / NETS has no lorry | **AL / HOUZS** | expensive overflow |

**Outstation = everything except Klang Valley.** Active carriers: NETS (main + WH), AL (Sg Buloh),
HOUZS (Balakong WH), TT, TEOW (JB), SSY, EU (JB, SG-only), TSDD (last-resort backup, poor service).
**GAI quit.** *(HOOKKA is NOT a carrier — it's the supplier OHANA, formerly named HOOKKA, bedframe + sofa.)*

**Three staging patterns (chosen by the assigned carrier) — geography is the driver:**
- **① Klang-collect (NETS / TT / TEOW):** stock sits at **Carres Klang**; carrier collects there.
- **② Sg-Buloh/Balakong (AL / HOUZS):** they **won't come to Klang**, so stock does NOT route through
  Carres Klang. Mattress (Nice Future) → **HOUZS picks up → HOUZS Balakong WH** → HOUZS delivers or
  **AL collects from Balakong**; Sofa (OHANA, Sg Buloh) → **AL picks up direct from OHANA**.
  **AUTO:** assigning AL/HOUZS should auto-arrange the HOUZS→Nice Future→Balakong mattress pickup
  (HOUZS already goes to Nice Future for his own-brand mattress — it piggybacks). *(build target)*
- **③ Push-to-partner-WH (SSY / EU, Singapore):** **Carres arranges stock TO SSY/EU's own warehouse;
  SSY/EU contact the customer & deliver** (they own the SG customer relationship). Not a Klang pickup.

> **Implication for the Portal:** the **carrier choice is the pivot** — it decides both the delivery
> AND the upstream stock staging path. So **`Stock Location` is multi-valued** (Carres Klang | HOUZS
> Balakong | at-supplier), NOT single. Suggest `ops_assigned_logistic` by destination region (KV→NETS,
> Melaka/Johor→TT/TEOW, SG→SSY/EU, north→NETS, overflow→AL/HOUZS); the chosen carrier then implies staging.

---

## 5. Master Sheet ↔ Portal mapping (what exists vs missing)

| Master Sheet concept | Portal today | State |
|---|---|---|
| Import (Ref, customer, items, PO) | `POST /api/orders/import` + import RPC (migr. 0143); `orders.source_ref[]`, `source_system`, `order_lines.source_po` | ✅ **Built + live** |
| Item explosion (core vs accessory/service) | `order_lines` + Item Group→category mapping in import | ✅ Built |
| PO / GRN | Procurement tab + `purchase_orders` + receive RPC | ✅ Built (receive is qty-based; per-unit pending — see §8/Phase D) |
| Assign logistic | Inbox dropdown → `orders.ops_assigned_logistic` | ✅ Built — *this is the 5%* |
| Customer ETA | `orders.delivery_date` | ✅ Built |
| Stock readiness (Ready/Not Ready) | `stock_balances` + per-unit `ops_stock_items` exist, but **no per-order Ready/Not-Ready rollup surfaced in Inbox** | ⚠️ Partial → compute + surface |
| Stock Location (KLG/HOUZS/NETS/GAI) | `orders.warehouse_id` (single WH assumption) | ❌ **Gap** (§4 model) |
| Stock ETA / Pending ETA | — | ❌ **Gap** (no column) |
| Logistic ETA (scheduled date) + Time (slot) | `orders.partner_eta` (free text) / `request_for_delivery_at` | ⚠️ Partial — no clean scheduled date+time |
| Before 7 Days (prep flag) | — | ❌ Gap (derivable from ETA) |
| Customer Request / Action For Logistic / Carres Remark / Warehouse Remark | — (planned as Jess's `ops_order_annotations` overlay, per import-contract §8) | ❌ **Gap** — coordinate with Jess |
| Issue / Issue Status / SN / PR | Service Notes module (migr. 0140, Jess) | ⚠️ Partial (Jess) |
| Balance / Storage Fees / Payment Status | Finance module has payments/invoices, but the simple ops-level "balance + storage fee + status" per order is not in the ops view | ⚠️ Partial → surface |
| Per-logistic work-order sheets (NETS/TSDD/…) | Partner role delivery views exist; **no operation-side per-logistic filtered work-order list** | ⚠️ Partial → Gap |
| Dashboard KPIs | Operation dashboard exists, but doesn't match the Master Sheet's exact KPIs (active-by-logistic, on-time/late, outstation) | ⚠️ Partial |
| Achieved (completed archive) | `orders` filtered by delivered/completed status | ✅ Built (filter) |

---

## 6. Gap summary — what the Inbox is missing to *be* the Master Sheet

1. **Per-order control fields** with no home yet: stock readiness rollup, **Stock
   Location**, Stock/Pending ETA, scheduled Logistic ETA + Time slot, Before-7-Days.
2. **The annotation layer**: Customer Request, Action For Logistic, Carres Remark,
   Warehouse Remark — likely Jess's `ops_order_annotations` overlay (coordinate).
3. **Multi-location stock model** (§4): Klang + HOUZS transfer + direct-from-supplier.
4. **The Inbox UI itself** is a thin table with one action; it needs to become an
   editable per-order control grid (and possibly a per-item drilldown to mirror `Ops`).
5. **Per-logistic work-order views** for operation (the NETS/TSDD/… tabs).
6. **Dashboard** parity with the Master Sheet's KPIs.
7. **Balance / payment status** surfaced inline in the ops view.

---

## 7. Target — the Inbox as the control grid

After import, every order should be one row Loo can fully *drive* from the Inbox:

- See & set: **Stock readiness + location + ETA**, **assigned logistic**, **scheduled
  delivery date + time**, **Before-7-Days** prep flag.
- See & edit: **Customer Request / Action For Logistic / Carres Remark / Warehouse
  Remark** (annotation layer).
- See: **PO(s)** + per-item **Stock Status** (Received?), **Balance / Payment Status**.
- Drill into per-item rows (mirror the `Ops` per-SKU granularity) where needed.
- Flow: **Pending Logistic → Done Schedule → Completed**, then drop to Achieved.
- Filtered per-logistic views = the NETS/TSDD/… work orders, generated automatically.

The Inbox stops being "awaiting logistic" and becomes **"every active order, fully
controllable"** — the Master Sheet, live.

---

## 8. Phased roadmap (proposal — for Loo to reorder)

- **Phase A — Import bridge** ✅ *DONE*: import door, Inbox assign-logistic, per-unit
  stock register, SKU/supplier seed.
- **Phase B — Inbox → control grid**: surface + edit the per-order operational columns
  (stock readiness, location, scheduled ETA + time, Before-7-Days, the 4 remark fields,
  balance/payment status). Split: which are **core columns** vs **Jess's `ops_`
  annotation overlay** (§9, §10).
- **Phase C — Multi-location stock model** (§4): Klang own WH + HOUZS transfer (outstation)
  + HOUZS direct-pickup-from-supplier; `Stock Location` as first-class.
- **Phase D — Per-unit receive (GRN)**: the earlier "逐件收货" — fits as the `Stock Status`
  cell of the per-item grid (units already minted at PO-open for Carres WHs).
- **Phase E — Per-logistic work-order views + Dashboard KPIs** matching the Master Sheet.
- **Phase F — Cutover**: operation stops using the Google Sheet; runs everything in Portal.

---

## 9. Open questions / decisions for Loo

1. **Core vs annotation split:** the remark fields (Customer Request / Action For
   Logistic / Carres Remark / Warehouse Remark) and Issue/Service-Note — are these
   **Jess's `ops_` overlay** (per import-contract §8) or core columns? Need to confirm
   what Jess has already built so Phase B doesn't duplicate it.
2. **Stock Location model (§4):** model HOUZS/NETS/GAI as **warehouses**, as a
   **location field**, or both? How is a **HOUZS-direct-from-supplier** PO represented
   (warehouse = HOUZS? a transfer record?)?
3. **Grid granularity:** does Loo manage primarily **per-order** (Delivery_Sum style)
   or **per-item** (Ops style) in daily use? (Determines the Inbox's default view.)
4. **Balance/payment:** reuse the existing Finance module, or a lightweight ops-level
   balance/status field mirrored from AutoCount's `Balance` column?
5. **Phase priority:** which of B–F first? (Suggest **B** — the control grid — first,
   since it unblocks daily use of the Inbox.)

---

## 10. Ownership boundaries (from `autocount-import-contract.md` §8)

| Area | Owner |
|---|---|
| `POST /api/orders/import` + import RPC + zod contract | **wenwei** (`apps/api`) |
| Core `orders` / `order_lines` / stock / delivery schema | shared chain (wenwei gatekeeps migrations) |
| `ops_order_annotations` (customer-360 / remarks overlay) | **Jess** (additive, read-only on core) |
| Issue Tracker module | **Jess** (`ops_` namespace) |
| Service Note module | **Jess** (`ops_` namespace, migr. 0140) |

> **Coordination note:** several Phase-B columns (remarks, issue, service note) overlap
> Jess's `ops_` modules. Confirm current state with Jess before building Phase B to
> avoid duplicate work or a schema collision on the shared DB.
