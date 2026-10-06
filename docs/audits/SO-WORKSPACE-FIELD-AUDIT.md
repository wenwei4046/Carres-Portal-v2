# SALES ORDER WORKSPACE — LINE-BY-LINE FIELD AUDIT

**Lane:** REVIEW · reports, does not fix.
**Surface:** `apps/web/src/pages/operation/SalesOrderWorkspace.tsx` (2,954 lines), serving
`/operation/orders/so/:orderId` (modes `object` + `oldrev`) and `/operation/orders/so/new` (mode `create`).
**Branch:** `dev_branch_yh` · **Date:** 2026-08-27

> **Route note, confirmed.** Bare `/operation/orders/so` has no route. `OperationApp.tsx:419-420`
> registers exactly `orders/so/new` and `orders/so/:orderId`. Nothing else resolves.

---

## 0-A · AMENDMENT LOG — re-measured 2026-08-28

The tree moved under this document twice before it was committed, and twice after. Re-measured
this morning; the corrections below **supersede the body text** wherever they disagree.

| Was | Now | Cause |
|---|---|---|
| **F-3** 🔴 the Money weighting never reaches the screen | ✅ **RESOLVED — and the ruling was retired, not implemented.** `Total large · Paid medium · Outstanding loudest` is retired by owner ruling (YH, 2026-08-28) at `MASTER.md:1234-1243`. All three amounts are now `text-strong` on `items-baseline`; colour alone separates. Pinned by `ui-contract.test.ts:526-535`, including a **negative** assertion so the retired sizes cannot return | `2e83249d` |
| **F-2(b)** 🔴 three call-sites clamp, one does not | ✅ **FIXED.** `stairCarryCount()` extracted to `order-totals.ts:94-99`; `floorSurcharge()` now derives `itemsTotal` from the order's own lines and clamps | `392a55e1` |
| **F-2(a)** the fee is not in `Total` | 🔴 **STILL OPEN, and worse than reported.** No payment door can collect it — see the expanded finding below | — |
| **F-5** "the MASTER states a false premise" | 🟡 **OVERSTATED — corrected below.** `createOrderInput` names **two different objects**; the POS door does require a proceed date | re-measure |
| **G-4** "the UI is narrower than the law" | 🟡 **REFUTED — corrected below.** The `delivery_payment_approver` duty key was never created, so the gate is behaviourally identical to `principal` | re-measure |
| rows #57, #58 `Amend delivery date` | `Change delivery date`, now governed at **CS:1500** | `2e83249d` |
| all `SalesOrderWorkspace.tsx` line citations | drifted ±20 lines (fieldset 1815→1835, `canDecide` 736→753, `canRaise` 731→748, stair clamp 1859→1810). **Match on symbol names, not line numbers** | `2e83249d`, `0d56546b` |

Unaffected: the +21 lines `0d56546b` added to COPY-STANDARD register the **delivery fee** on the
POS confirm step — a different surface. The `NOT REGISTERED` list in §4 stands.
**F-1 stands unchanged** — `ui-contract.test.ts:152` and `:608` still assert the *source string*
`disabled={mode === "oldrev"}`, which remains why the test passes while the DOM does not.

---

## 0-B · THE REFUTATION ROUND, FINALLY RUN — 2026-08-28

§0 recorded that the adversarial pass "DID NOT RUN" and named §4 as the section carrying the
residual risk. It has now run, together with the two coverage gaps §9 listed. **It was right to
be worried: the copy pass was the weakest part of this document, and it was wrong in both
directions.**

### What it did to this audit's own findings

| Class | Count | Examples |
|---|---|---|
| **Citations simply WRONG** | 8 | `CS:1735` (used in rows 39, 52 and Tier C) is *"Nobody holds PO duty this month."* — the measure-word row is **CS:1764**. In Tier B: `Cancel SO` is **M:1338**, not M:1250/M:1334 · `Paid` is **M:1321**, not M:1239 · `No lift`/`Has lift` is **M:333**, not M:288 · `creates a Revision · needs approval` is **M:252/264/1314**, not M:259 · **`Goods` has no backticked entry in either MASTER**, so its M:1171 citation does not hold at all |
| **`NOT REGISTERED` marks REFUTED** — the word was governed all along | 12 | `Item` (**M:227**, one of the six locked columns — which also kills row 82) · `Print ▾` (**M:1269**, printed verbatim, caret included) · `New Sales Order` (**M:5156**) · `Delivery payment approval` (**CS:1405**) · `Reason` + `Send request` (**CS:1406**) · `Approve` · `Refuse` · `Decision reason` (**CS:1407**) · `Waiting for decision` (**CS:1409**) · `More actions` (**CS:1503**) · `Accessory` (**CS:1081**) |
| **Marks UPGRADED — the word is BANNED, not merely unregistered** | 6 | see the table below |
| **Strings MISSED entirely** | 5 | see below |

### 🔴 The six that are worse than reported

| String | Where | Ruling |
|---|---|---|
| `Required for delivery` | Building type field error | **CS:1982** says *"Fixed phrasings — reuse, never invent a variant"*; **CS:1985** fixes the refusal as `Fill in the building type first — a condominium can only take a half-day delivery.` This is an invented variant |
| `Building type is required — pick what kind of building the delivery goes to` | toast | Same ruling. **Row 96 marked this OK — that was wrong.** Two invented variants of one ruled refusal now ship on this screen |
| `Add item` | GOODS create | **CS:925** rules the control `Add line` and lists `Add item` under *Do NOT use*. **Row 79 marked this OK.** CS:930 excuses the Sales Portal by name; this workspace is not covered |
| `Remove line` | GOODS aria-label | **CS:926** rules `Remove` and lists `Remove line` under *Do NOT use*. Row 78 charged only "icon-only" |
| `Today` | `Ordered` value, create mode | **CS:1890** and **CS:2190** ban it portal-wide (*"`Today` and `Tomorrow` are not dates"*) |
| `Other goods` | category fallback | **CS:1082** BANS it for the no-catalog-row fact and rules **`Not in catalog`** — the word this same file already uses at the SKU hint. Two spellings, one fact |

### 🟡 Governed but MISSPELLED on screen

- `A proposal is waiting for management.` → **CS:1650** rules `Waiting for management`
- `A proposal on this order is out of date.` → **CS:1655** rules `Out of date — propose again`

### Strings this audit missed entirely

- **`Sales Order views`** — the second aria-label (`:2513`). §1 row 100 recorded only the other one.
- **`DRAFT`** — not internal: the PDF template prints `SALES ORDER · DRAFT` on the paper. **CS:1320** bans `Draft` on the customer-order axis.
- **`To be confirmed`** — the document's delivery date when `delivery_date_tbd`. A near-variant of **CS:1656** `Delivery date to be confirmed`.
- **The em-dash `—` used as a VALUE** for a missing customer name or address. **CS:2096-2110** (*AN ABSENT VALUE READS AS WORDS*) bans exactly this and rules `No {field}`.
- **`Carres`** as the dealer-name fallback — a document with no dealer names the house as the dealer.

### One finding that needs re-measuring

**F-9** (`Ordered` means two things) cited CS:639/:701, the Purchasing status words. It missed
**CS:1624**, which rules *"The day the order was taken"* as `Ordered: {date}` — precisely this
screen's meaning. The finding may survive on the *colon*, but its cited basis was wrong.

### Verified and closed, so nobody re-reports them

- The punctuation sweep is **clean** — U+2026 used consistently, no three-dot ellipsis in any visible string.
- The dead collapsible strings (`Hide`, `Unsaved changes here`, `This section has unsaved changes`) are **genuinely unreachable** — no `Block` on this screen passes `summary`.
- `MYR` never renders — the template maps it to `RM` before printing.

---

## 0 · What this audit ran, and what it did not

Honesty about coverage matters more than a clean-looking report, so this is stated first.

| Pass | State |
|---|---|
| Authority read — MASTER, COPY-STANDARD, ERP-ARCHITECTURE, carry-forwards, UI MASTER | ✅ complete (134 + 171 + 34 rulings recovered) |
| Database pass — every column asked of `supabase/migrations/` (403 files) | ✅ complete (65 columns/constraints established) |
| Gate pass — every RPC's SQL role check + every HTTP guard | ✅ complete (32 gates established) |
| Field-by-field render walk | ✅ complete — performed directly against source |
| **Adversarial refutation round** | ⚠️ **DID NOT RUN** — the agent fleet died on a session limit |

**Consequence, stated plainly.** The refutation round that normally kills plausible-but-wrong
findings never executed. So every 🔴 in this document was **re-verified by hand against primary
evidence before being written**, and the claims that did not survive that hand-check are recorded
in §6 as *refuted* rather than quietly dropped. The one section carrying residual risk is the
`NOT REGISTERED` list (§4), which is large and machine-generated; it is therefore **tiered by
confidence** rather than presented as a flat verdict list.

---

## 1 · THE FIELD TABLE, IN RENDER ORDER

Legend — **W?**: `RO` read-only · `ED` editable · `CR` create-only · `AM` amendment-only · `–` n/a.
**Gov?**: `CS:<line>` COPY-STANDARD · `M:<line>` governed by `docs/orders/MASTER.md` only · `NR` not registered.

### 1.1 · CHROME — above the cards

| # | What the user sees | Card | Control | DB column / source | W? | Who may write | Gov? | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | `← Sales Orders` | CHROME | back link | DERIVED — route constant | – | – | CS | OK |
| 2 | `SO-{n}` / `New Sales Order` / `Sales Order` | CHROME | identity | `orders.so` int NOT NULL UNIQUE, seq `orders_dl_seq` start 1251, renamed from `dl` by 0123 | RO | nobody (sequence) | M:1118 | OK — never truncates, per M:1118 |
| 3 | Customer name, capitalised up | CHROME | identity | `orders.customer_name` text NOT NULL → `displayCustomerName()` | RO | — | M:1118 | OK — display-only cast; the input below keeps the raw value |
| 4 | `New Sales Order — Carres` / `SO-{n} — Carres` | CHROME | `docTitle` | DERIVED | – | – | NR | 🟡 browser-tab string, governed nowhere |
| 5 | `Order` `Revisions` `History` `Order Route` | CHROME | nav | `OBJECT_VIEWS` const :948 | – | – | M:140 | OK — exactly the four M:140 locks |
| 6 | `More actions` | CHROME | `<summary>` | — | – | UI: `mode==='object' && view==='Order' && status!=='cancelled'` | NR | 🟡 not a verb+object (CS rule 1) |
| 7 | `Report a problem` | CHROME | button | opens ServiceCaseWizard → Service's record | – | UI: as #6 · API: Service routes | CS | OK |
| 8 | `Propose a change to the customer` | CHROME | button | bumps `amendSignal` → SalesOrderAmendment | AM | RPC `sales_order_submit_amendment`: operation\|principal | M:1230 | OK |
| 9 | `Cancel SO` | CHROME | button (danger) | `CancelSalesOrderDialog` | – | RPC cancel gate | M:1250, M:1334 | 🟡 governed by MASTER, absent from COPY-STANDARD |
| 10 | `Discard` (create) | CHROME | button | — | – | – | CS:1468 | OK |
| 11 | `Create order` | CHROME | primary | `sales_order_create` | CR | UI: create mode · API `requireOperation` · RPC operation\|principal | NR | 🟡 unregistered; mirrors `Save` but is not in the dictionary |
| 12 | `Back to current` | CHROME | button | clears `?revision` | – | – | NR | 🟡 |
| 13 | `Print ▾` | CHROME | button | `renderSalesOrderPdf(printData)` — **SAVED data only** | RO | – | NR | 🟡 the `▾` promises a menu that does not exist; one click opens a blob |
| 14 | `Viewing Rev {n} · read-only` | CHROME | chip | `sales_order_revisions.revision` int CHECK `>=1` | RO | — | NR | 🔴 **the banner is not true** — see F-1 |
| 15 | `Customer reference {refs}` | CHROME | meta line | `orders.source_ref` **text[]** NULL, AutoCount refs (0132:39) | RO | importer only | NR | 🟡 |

### 1.2 · CUSTOMER card

| # | What the user sees | Card | Control | DB column / source | W? | Who may write | Gov? | Verdict |
|---|---|---|---|---|---|---|---|---|
| 16 | `Customer` | CUSTOMER | block title | — | – | – | M:240 | OK |
| 17 | `New customer` / `Existing customer` / `Not known yet` / `Checking…` | CUSTOMER | chip | DERIVED — `useCustomerTypeProbe(phone)`, 400ms debounce, same probe as POS | RO | nobody | M:1220 | OK — read-only on both surfaces, as ruled |
| 18 | `Full name` **required** | CUSTOMER | Input | `orders.customer_name` text **NOT NULL**, no CHECK | ED | UI `validateDraft` · API `z.string().trim().min(1)` · RPC raises | NR | OK (word unregistered) |
| 19 | `Phone` | CUSTOMER | Input | `orders.customer_phone` text NULL, no CHECK, **no normaliser** | ED | API `z.string().nullable()` | NR | 🔴 **POS locks this required; this door does not** — see F-6 |
| 20 | `Email` | CUSTOMER | Input | `orders.customer_email` text NULL, no CHECK | ED | required flag read from config ✅ | NR | OK — the one builtin whose `required` is actually honoured |
| 21 | `Race` + `Malay` `Chinese` `Indian` `Other` | CUSTOMER | Select | `orders.customer_race` text NULL — **NO CHECK; free text at the DB** | ED | list is TypeScript-only (`sales-order-form.ts:29`) | NR | 🟡 four ruled values, zero DB enforcement |
| 22 | `Gender` + `Female` `Male` | CUSTOMER | Select | `orders.customer_gender` text NULL — **NO CHECK** | ED | TypeScript-only list | NR | 🟡 as above |
| 23 | `Birthday` | CUSTOMER | DatePicker | `orders.customer_birthday` date NULL, **no past-date/age guard** | ED | API regex `YYYY-MM-DD` | NR | 🟡 a future birthday persists |
| 24 | operator's own fields (0219) | CUSTOMER | Input/Select/DatePicker | `orders.entry_data->'fields'->><key>` jsonb, **no schema** | ED | `entry_fields` record, merged not replaced | – | OK — merge semantics correct (0354:244) |
| 25 | `Delivery address` | CUSTOMER | SubHead | — | – | – | M:268 | OK — locked word survives the merge |
| 26 | `Address not given yet` | CUSTOMER | Checkbox | `orders.customer_address_unknown` bool NOT NULL DEFAULT false | ED | conditional render: blank OR already ticked | M:319 | OK — the M:319 hazard rule is correctly implemented |
| 27 | `Address line 1` / `Address line 2` | CUSTOMER | Input ×2 | `customer_address_line1/2` text NULL, no CHECK | ED | — | NR | 🟡 |
| 28 | `State` | CUSTOMER | Select | `customer_address_state` text NULL, no CHECK | ED | `MY_STATES` | NR | OK — cascade correct |
| 29 | `City` + `Pick a state first` | CUSTOMER | Select + hint | `customer_address_city` text NULL | ED | `getCities(state)` | NR | OK |
| 30 | `Postcode` + `Pick a city first` | CUSTOMER | Select + hint | `customer_address_postcode` text NULL | ED | `getPostcodes(state,city)` | NR | OK — cascade invalidation verified (`addressCascadePatch`) |
| 31 | `Building type` **required** + `Required for delivery` | CUSTOMER | Select + error | **UNTRACED as a column** — `entry_data->'fields'->>'building_type'`; `building_type` has **0 hits across all 403 migrations** | ED | UI `validateDraft` only | NR | 🔴 **load-bearing delivery fact with no column, no constraint** — see F-7 |
| 32 | `Landed` `Condo` `Apartment` `Office` `Retail` `Other` | CUSTOMER | options | `BUILDING_TYPE_OPTIONS` | ED | TypeScript-only | NR | 🔴 M:4695 makes slot length depend on these exact words; a typo in jsonb is unnoticed |
| 33 | `Billing address same as delivery` | CUSTOMER | Checkbox | `customer_billing_same` bool NOT NULL **DEFAULT true** | ED | — | NR | OK |
| 34 | `Billing address` | CUSTOMER | Input (conditional) | `customer_billing` text NULL | ED | generic text path | NR | OK |
| 35 | `Emergency contact` | CUSTOMER | SubHead | gated on `builtins.emergency.enabled` | – | – | M:243 | OK |
| 36 | `Name` / `Phone` / `Relationship` | CUSTOMER | Input ×3 | **THREE fields over ONE column** `orders.customer_emergency` text NULL | ED | `composeEmergencyContact` / `parseEmergencyContact` | NR | 🔴 **the round-trip is lossy when Name is blank** — see F-4 |
| 37 | `Spouse` `Parent` `Child` `Sibling` `Relative` `Friend` `Colleague` `Helper` | CUSTOMER | `<datalist>` | free-text escape kept deliberately | ED | — | NR | OK — the escape hatch is right (imports must survive) |

### 1.3 · MONEY card — read-only forever (ownership Law B)

| # | What the user sees | Card | Control | DB column / source | W? | Who may write | Gov? | Verdict |
|---|---|---|---|---|---|---|---|---|
| 38 | `Money` | MONEY | block title | — | – | – | M:252 | OK |
| 39 | `Total` + amount / `No price yet` | MONEY | fact | DERIVED — `orderMoney({lineSum, addonSum})` = **lines + addons ONLY** | RO | nobody | CS:1735 (measure word) | 🔴 **excludes the stair fee this same screen prints** — see F-2 |
| 40 | `Paid` + amount | MONEY | fact | `orders.paid` numeric(12,2) NOT NULL DEFAULT 0, **no non-negative CHECK, no trigger** | RO | Payments desk | M:1239 | 🟡 `order_payments` has no reader; `paid` is written directly (M §11) |
| 41 | `Outstanding` + amount / `Paid in full` | MONEY | fact, red while owed | DERIVED — `max(0, total − paid)`; `storageOwing` **not passed here** | RO | nobody | CS:1384 | 🟡 the Payments desk can include storage; this screen cannot |
| 42 | the three numerals | MONEY | `<Money>` | — | RO | – | M:1239 | 🔴 **KNOWN-OPEN, confirmed not closed** — see F-3 |
| 43 | `Open this order in Payments` | MONEY | link | navigates `?tab=payments&so={so}` | RO | – | M:1237 | OK — Law C door, writes nothing |
| 44 | `Delivery payment approval` | MONEY | sub-block | `order_delivery_payment_approvals` | – | – | M:4493 | OK |
| 45 | `Request payment approval` | MONEY | button | RPC `delivery_payment_approval_request` | ED | UI: operation\|salesperson\|principal | M | 🔴 **GATE MISMATCH** — see G-3 |
| 46 | `Reason` / `Send request` / `Cancel` | MONEY | Textarea + buttons | `request_reason` text NOT NULL | ED | reason required in schema, RPC *and* table CHECK | NR | OK — three-layer agreement, the model for the rest of the screen |
| 47 | `Waiting for decision · requested {date} · {reason}` | MONEY | status line | `status='pending'`, `requested_at` | RO | — | NR | OK |
| 48 | `Decision reason` / `Approve` / `Refuse` | MONEY | Textarea + buttons | RPC `delivery_payment_approval_decide` | ED | UI: `principal` only | NR | 🔴 **GATE MISMATCH** — see G-4 |
| 49 | `COD approved — collect before unloading` | MONEY | status line | `status='approved'` | RO | — | M:4493 | OK |
| 50 | `Refused · {date} · {reason}` | MONEY | status line | `status='refused'` | RO | — | NR | 🟡 |

### 1.4 · ORDER INFO card

| # | What the user sees | Card | Control | DB column / source | W? | Who may write | Gov? | Verdict |
|---|---|---|---|---|---|---|---|---|
| 51 | `Order info` | ORDER INFO | block title | — | – | – | CS:1461 | OK |
| 52 | `Ordered` + date / `Today` | ORDER INFO | Fact | `orders.placed_at` timestamptz NOT NULL DEFAULT now() | RO | nobody (neither RPC writes it) | CS:1735 | 🔴 **same word, two meanings app-wide** — see F-9 |
| 53 | `Requested Delivery Date` | ORDER INFO | DatePicker (create) / Fact (object) | `orders.delivery_date` date NULL | CR / AM | **not in the save whitelist** | CS:1357 | OK — the word is correctly the 2026-08-27 ruled one |
| 54 | `Earliest {date} — production lead` | ORDER INFO | hint | DERIVED — `earliestPromiseISO` ← catalog categories | – | – | NR | OK — same floor as POS |
| 55 | `Too soon — earliest is {date}` | ORDER INFO | error | as above | – | – | NR | OK |
| 56 | `No delivery date` (amber chip) | ORDER INFO | attention chip | `delivery_date_tbd` bool NOT NULL DEFAULT false | RO | — | M:1035 | OK |
| 57 | `Change delivery date` *(was `Amend delivery date` until `2e83249d`)* | ORDER INFO | button → Modal | `sales_order_submit_amendment` | AM | operation\|principal | **CS:1500** | OK — door sits beside the fact it moves; the word is now registered, with its note |
| 58 | `creates a Revision · needs approval` | ORDER INFO | modal description | — | – | – | M:259 | OK — governed copy moved, not reworded |
| 59 | `A proposal is waiting for management.` | ORDER INFO | note | live `sales_order_amendments` row | RO | — | NR | 🟡 |
| 60 | `A proposal on this order is out of date.` | ORDER INFO | note | `amendment.stale` | RO | — | NR | 🟡 says what is wrong, not the fix (CS rule 6) |
| 61 | `Proceed date` / `Not recorded` | ORDER INFO | DatePicker (create) / Fact (object) | `orders.proceed_date` date NULL, **no CHECK** | CR | UI create only | CS:1326 | 🔴 **nothing enforces it at create; the orphan is unfixable** — see F-5 |
| 62 | `After the delivery date` | ORDER INFO | error (create) | UI-only comparison | – | – | NR | 🟡 UI-only; no API or DB guard |
| 63 | `Floor (Max is 3rd Floor)` | ORDER INFO | Input number | `orders.delivery_floor` int NOT NULL DEFAULT 1, **NO CHECK** | ED | UI clamps [0,3] · API `min(0)` **no max** · DB none | NR | 🔴 **three layers, three bounds** — see F-8 |
| 64 | `Items needing stair carry` + `0 to {n}` | ORDER INFO | Input number | `orders.delivery_stair_items` int NULL, no default, **no CHECK** | ED | UI `max(0,…)` **no upper clamp on input** | M:309 | 🔴 **writes a value three other call-sites clamp** — see F-2 |
| 65 | `Lift available?` + `No lift` / `Has lift` | ORDER INFO | Select | `orders.delivery_has_lift` bool NOT NULL DEFAULT false | ED | — | M:288 | 🟡 the ruling wanted a blank to stay blank; a boolean cannot hold one |
| 66 | `{n} of {n} items × {n} floors above {n}F × RM{n} = RM{n}` | ORDER INFO | working line | DERIVED — `floorSurchargeRaw` | RO | – | M:288 | 🔴 narrates money that never reaches `Total` (F-2) |
| 67 | `Sales ownership` | ORDER INFO | SubHead | — | – | – | CS:1461, M:268 | OK |
| 68 | `Dealer` + `Pick a dealer` | ORDER INFO | Select (create) / Fact | `orders.dealer_id` uuid **NOT NULL** FK dealers | CR | create only; save door **raises** | NR | OK — refusal verified (0354:150) |
| 69 | `Showroom` | ORDER INFO | Select / Fact | `orders.outlet_id` uuid NULL FK outlets | CR | as above | NR | 🔴 **the POS calls this field `Outlet`** — see F-10 |
| 70 | `Salesperson` | ORDER INFO | Select / Fact | `orders.salesperson_id` uuid NULL + CHECK `orders_salesperson_required` | CR | as above | NR | OK |
| 71 | `Not recorded` | ORDER INFO | absence word | — | – | – | M:1040 | OK — governed by MASTER, not COPY-STANDARD |
| 72 | `Change salesperson` + Approve / Reject / Apply / Take the approval back | ORDER INFO | SalesOrderAttribution | `sales_order_attribution_requests` | ED | see G-1, G-2, G-5 | CS:1474 | 🔴 **three separate gate mismatches** |

### 1.5 · GOODS card

| # | What the user sees | Card | Control | DB column / source | W? | Who may write | Gov? | Verdict |
|---|---|---|---|---|---|---|---|---|
| 73 | `Goods` | GOODS | block title | — | – | – | M:1171 | OK |
| 74 | `SKU` + catalog label / `Not in catalog` | GOODS | Input + datalist | `order_lines.sku` text NOT NULL, **no FK** | CR | create only (`p_lines: null` on save) | NR | OK — unlisted SKU stays typeable, correctly |
| 75 | `Qty` | GOODS | Input number | `order_lines.qty` int NOT NULL CHECK `qty > 0` | CR | — | NR | OK — the only CHECK on the table |
| 76 | `Unit price (RM)` | GOODS | Input number | `order_lines.unit_price` numeric(12,2) NOT NULL, **no CHECK** | CR | plpgsql guard only | NR | 🟡 a negative price is refused by the RPC, not the column |
| 77 | `Catalog RM {n}` / `Catalog RM {n} — this line differs` | GOODS | hint | `product_skus.price` | RO | – | NR | OK — hint, never a refusal; correct call |
| 78 | `Remove line` (aria-label only) | GOODS | icon button | — | CR | — | NR | 🟡 icon-only; CS rule "icons alone do not teach" |
| 79 | `Add item` | GOODS | button | — | CR | — | NR | OK |
| 80 | `Category` | GOODS | `<th>` | DERIVED — `categoryWord()`, four rungs | RO | – | NR | OK — D9 fix (rung ② catalog) verified present |
| 81 | `Unit ID` / `Not allocated` | GOODS | `<th>` / cell | Stock's fact via `/expansion` | RO | Stock | CS | OK — Law B summary |
| 82 | `SKU` / `Qty` / `Item` | GOODS | `<th>` ×3 | `order_lines` | RO | — | NR | 🟡 `Item` unregistered |
| 83 | `Deliver To` / `Loading…` / `Not recorded` | GOODS | `<th>` / cell | Purchasing's fact | RO | Purchasing | CS | OK |
| 84 | `ACCESSORY` / `OTHER GOODS` | GOODS | category cell | `lineClass()` rung ④ — the only guessing rung | RO | – | NR | 🟡 uppercased words no dictionary carries |
| 85 | `SERVICE` + `addon_key` printed **twice** | GOODS | addon rows | `order_addons.addon_key` text NOT NULL FK addons(key) | RO | — | NR | 🔴 the raw key is shown as both `SKU` and `Item`; no human label |
| 86 | `Size` `Firmness` `Colour` `Fabric code` `Seat height` `Sofa height` `Configuration` `Sofa configuration` | GOODS | config line | `order_lines.attrs` jsonb | RO | — | NR | 🟡 eight labels, none registered |
| 87 | *(add-ons cannot be added or amended here)* | GOODS | hidden `<span data-pos-field="orderAddons">` | — | – | — | – | 🔴 **KNOWN-OPEN, not folded in** — the POS asks this question; this screen renders an invisible marker |

### 1.6 · CHROME — below the cards, and the right pane

| # | What the user sees | Card | Control | DB column / source | W? | Who may write | Gov? | Verdict |
|---|---|---|---|---|---|---|---|---|
| 88 | `What this change started elsewhere` | CHROME | block (conditional) | `/correction-work` | RO | — | M:249 | OK — renders only when work exists |
| 89 | `⚠ {n} change` / `⚠ {n} changes` | CHROME | save bar | DERIVED — `changedFields` counts **draft keys** | – | – | CS:1468 | 🟡 counts keys not columns: ticking `Billing address same as delivery` can count 1 while writing 2 |
| 90 | `Discard` / `Save` | CHROME | save bar | `sales_order_save_revision` | ED | UI dirty · API `requireOperation` · RPC operation\|principal | CS:1468 | OK — the one place all three layers agree exactly |
| 91 | `Discard unsaved changes?` | CHROME | **native `window.confirm`** | — | – | – | NR | 🟡 governed copy inside a browser dialog no token or translation reaches |
| 92 | `Saved · Rev {n}` / `SO-{n} created · Rev 1` | CHROME | toast | `sales_order_revisions.revision` | – | – | NR | 🟡 |
| 93 | `Customer name is required` · `A dealer is required` · `A salesperson is required` · `An order needs at least one item` | CHROME | toasts | `validateDraft` — **mirrored verbatim in the RPC** | – | – | NR | OK — the intent match is exemplary; the words are unregistered |
| 94 | `Delivery is too soon — the earliest this cart can be promised is {date}` | CHROME | toast | `earliestPromiseISO` | – | – | NR | 🟡 21 words vs the 12-word rule (CS Primary School Standard) |
| 95 | `The proceed date is after the delivery date` | CHROME | toast | UI-only | – | – | NR | 🟡 states the fault, not the fix (CS rule 6) |
| 96 | `Building type is required — pick what kind of building the delivery goes to` | CHROME | toast | UI-only | – | – | NR | OK — names the fix, as CS rule 6 demands |
| 97 | `You have unsaved changes — printing the saved version` | CHROME | toast | — | – | – | CS:1495 | OK |
| 98 | `Opening the sales order` / `Opening the order route` | CHROME | Loading | — | – | – | NR | 🟡 |
| 99 | `This sales order could not be opened` / `This order route could not be opened` / `No route facts were found for this sales order` / `Try again` | CHROME | EmptyState | — | – | – | NR | 🟡 error states teach nothing about the fix |
| 100 | `Sales Order document` | CHROME | `aria-label` | — | – | – | NR | OK |
| 101 | `⚠ Amendment pending approval: delivery date → {date}` | CHROME | banner | live amendment `proposed_snapshot` | RO | — | M:1230 | OK — a proposal never enters the paper; correct |
| 102 | `UNSAVED` | CHROME | watermark | `dirty` | – | – | CS:1469 | OK — preview chrome, never printed |
| 103 | `Revisions` / `History` pane heading | CHROME | `<h2>` | `SalesOrderLedger` | RO | — | M:140 | OK |

---

## 2 · THE FINDINGS

### 🔴 F-1 · The read-only banner is not true

`Viewing Rev {n} · read-only` renders over inputs that report `readOnly=false` and
`disabled=false` on production. The source *does* carry the lock —
`<fieldset disabled={mode === "oldrev"} className="contents">` at `SalesOrderWorkspace.tsx:1815` —
but the disabled state does not reach the controls.

**KNOWN-OPEN. Not re-derived, not closed.** Scoped as
`docs/cards/CARD-2026-08-27-sales-order-old-revision-fields-lock.md` (status QUEUED).
No data is at risk: `oldrev` has no writer and `changedFields` returns `[]` by construction.

**The one fact this audit adds:** `SalesOrderWorkspace.ui-contract.test.ts` asserts the
*source string* `disabled={mode === "oldrev"}` — which is why the test passes while the DOM does
not. The card already requires a rendered-DOM test; this confirms why.

### 🔴 F-2 · The stair fee — EXPANDED 2026-08-28. Part (b) is fixed; part (a) is worse than reported

> **(b) IS FIXED** by `392a55e1` — `stairCarryCount()` is extracted and `floorSurcharge()` now
> clamps against the order's own line quantities. The four call-sites agree again.
>
> **(a) IS WORSE.** Re-measured end to end, the fee is not merely missing from `Total` — it is
> **uncollectible by every door in the portal**:
>
> - The customer **signs** for it. `Step3SignaturePayment.tsx` itemises `Stair carry` twice
>   (`:271-278`, `:314`), folds it into the 36px headline `Total` (`:123`, `:316-320`), sizes the
>   deposit buttons off it (`:124`, `:397`, `:414`), and the T&C the customer ticks says
>   *"Stair-carry surcharges (if any) are billed on this sales order"* (`:655-657`).
> - The database does not express it **today**. No column, no addon row, **no writer**. Only the
>   three *inputs* are stored. Change `floor_config.per_floor_per_item` and every historic order's
>   displayed fee silently changes.
>
>   ⚠️ **CORRECTION (YH, 2026-08-28).** An earlier draft of this finding said a stair addon was
>   *"FK-impossible"*. **That was wrong.** `order_addons.addon_key` is FK-constrained to `addons`,
>   but `addons` rows are **operator-creatable**: `POST /api/catalog/addons`
>   (`catalog.ts:1854-1880`, gate `internalOnly`, schema `addonCreateInput`
>   `schemas/catalog.ts:1302-1313`) inserts a new kebab-case key, and the door is on screen at
>   **Settings → Catalog → Special**. Six keys are *seeded*; the set is not closed.
>   **So the missing piece is not the schema and not the key — it is the WRITER.** The pattern is
>   already proven one file away: `delivery-fee-recompute.ts` computes the delivery trip fee
>   server-side and appends `DELIVERY` / `DELIVERY_CROSS` / `DELIVERY_ADD` rows to `order_addons`.
>   Stair carry was simply never wired into that machinery — which is why the same file's claim
>   that stair *"folds into the order total"* (`:38-39`) reads as true and is not.
>   *(One design note for whoever builds it: `addons.price` is a fixed per-key price, while stair
>   carry is computed. The recompute would write the per-order figure into `order_addons.qty` /
>   `unit_price`, exactly as the delivery fee rows already do.)*
> - **No payment door can collect it.** `stripe-checkout.ts:117-121` caps against lines+addons and
>   returns **422 `amount_exceeds_outstanding`** at `:158-168` — *before* Stripe is called, so
>   nothing appears in the Stripe dashboard. `top_up_order` caps identically
>   (`0351:245-249`) and answers *"Order is already fully paid"*. The lifetime ceiling through
>   every door is lines + addons.
> - The customer's **own SO PDF** prints the lower total and a `balance_due` that can go negative
>   (`orders.ts:4121-4126`).
>
> **Worked example, at seeded rates** (`free_up_to_floor 2`, `per_floor_per_item 50`) — 5 items
> @ RM 1,890, floor 3, no lift, 3 needing carry: POS quotes **RM 9,600**, database can only ever
> describe **RM 9,450**, and the **RM 150** difference is uncollectible. *(Floor 4 is
> unreachable — `MAX_DELIVERY_FLOOR = 3`, enforced at every door but with no DB CHECK.)*
>
> ⚠️ The phrasing *"Stripe rejects payments that include stair carry"* circulating in another
> session is substantively right but mechanically wrong: **Carres' own route refuses**, before
> Stripe. Debugging in the Stripe dashboard will find nothing, and fixing it as a Stripe bug
> fixes the wrong file.

*Original finding follows.*

**(a) The money on screen does not add up.** `ORDER INFO` prints
`3 of 5 items × 2 floors above 2F × RM50 = RM300`. `MONEY` prints
`Total` = `orderMoney({lineSum, addonSum})` — **lines + addons only** (`order-money.ts:100`).
No `STAIR` addon key exists in any migration, so the fee is never persisted as a charge.
Two cards on one screen state two different amounts for one order, and neither says so.

**(b) Law D — three call-sites clamp, one does not.** Verified by hand:

| Call-site | Clamp |
|---|---|
| `SalesOrderWorkspace.tsx:1859` | `max(0, min(itemsTotal, n ?? 0))` ✅ |
| `order-totals.ts:192` (`draftTotals`, POS cart) | `max(0, min(itemsTotal, n ?? 0))` ✅ |
| `StairCarryFields.tsx:43` (POS stepper) | `max(0, min(itemsTotal, n ?? 0))` ✅ |
| **`order-totals.ts:77`** (`floorSurcharge`, used by `PosOrderDetail.tsx:695`) | **`max(0, n ?? 0)` — no upper clamp** 🔴 |

Reachable: this screen's `Items needing stair carry` is a free number input whose `onChange` is
`Math.max(0, …)` with **no upper clamp**, the API accepts `z.number().int().min(0)` with no max,
and the column has no CHECK. Type `99` on a 3-item order → this screen shows the fee for 3, the
POS order detail shows the fee for 99. The file's own comment at `:1841` claims *"THE ARITHMETIC
IS IMPORTED, NEVER RE-TYPED (ownership Law D)"* — the function is shared; **the clamp is not.**

### 🔴 F-3 · The Money weighting ruling never reaches the screen

`MASTER.md:1234` and `ui/MASTER.md:775`: *Total large · Paid medium · Outstanding loudest.*
Measured:

| Row | Wrapper token | `<Money>` numeral |
|---|---|---|
| Total | `text-title` (20px) | `text-body` **13px** |
| Paid | `text-strong` (15px) | `text-body` **13px** |
| Outstanding | `text-page` (24px) | `text-body` **13px** |

`Money.tsx` `DIGITS.row = "text-body font-semibold"` and the workspace passes no `tone`, so all
three numerals render at 13px. The wrapper tokens style only the fallback strings
(`No price yet`, `Paid in full`). **KNOWN-OPEN — shared component, changes everywhere at once.**

### 🔴 F-4 · The emergency contact round-trip is lossy when Name is blank

Three fields over one column. `composeEmergencyContact` **drops empty parts**, so position is
destroyed:

```
{name:"", phone:"012-3456789", relationship:"Spouse"}
  → compose → "012-3456789 · Spouse"
  → parse   → {name:"012-3456789", phone:"Spouse", relationship:""}
```

Nothing on the form requires Name — all three are plain Inputs. Save, reload, and the phone has
become the name.

**Why the test suite did not catch it.** `sales-order-form.test.ts:31` pins
`compose(parse(stored)) === stored` — the **string** direction. The **parts** direction
(`parse(compose(parts))`) is never asserted. *The surviving invariant is the string round-trip;
a parts round-trip test would be an addition, not a replacement. No test needs deleting.*

### 🟡 F-5 · The office create door can birth an orphan the POS door cannot — CORRECTED 2026-08-28

> **CORRECTION.** The original finding said the MASTER states a false premise. That was
> overstated. **`createOrderInput` names two different objects in this repo**, and the MASTER's
> sentence is true of one of them:
>
> | Door | Schema | Requires a proceed date? |
> |---|---|---|
> | **POS / Sales Portal** `POST /api/orders` | `createOrderInputSchema`, `packages/shared/src/schemas/orders.ts:325-327` | **YES** — and `order-entry.ts:246` pins it `locked, defaultRequired, not toggleable` |
> | **Office** `POST /api/operation/orders` | the *local* `createOrderInput`, `apps/api/src/routes/operation/orders.ts:1483-1499` | **no** |
> | **Raw** door | — | **no** |
>
> So the premise holds for the door most orders come through. What remains true, and is the
> finding: **the office door is permissive at all three layers** — no `validateDraft` guard
> (`:1356-1380`), `proceed_date` inherited as `.nullable().optional()` from `revisionHeaderInput`
> (`:855`), and `sales_order_create` inserts `nullif(…)::date` with no NULL check
> (`0374:115`). An SO keyed on this screen can be born with no proceed date, and this same
> screen then renders it read-only as `Not recorded` forever.
>
> **Also measured:** the proceed date has **no derivation anywhere** — no lead-time arithmetic,
> no production calendar, no delivery-minus-lead formula. It is a salesperson's free choice. The
> only guidance in the product is prose in a hint: *"pick it deliberately (e.g. ~a month before
> delivery) so we don't reserve stock too early"* (`Step3Delivery.tsx:139-143`). The one rule
> enforced at every layer is `proceed_date <= delivery_date`.
>
> **Provenance of the read-only ruling.** All three proceed-date lines in `MASTER.md` landed in
> ONE commit — `2515a136`, authored by `yhcominthruWork`, squashed PR #923, whose body never
> mentions proceed date. The `(Jess)` attribution is a **quoted ruling recorded by a session**;
> the quotation marks at `:287-288` are the entire provenance. Neither Lim, Chai nor Jess has
> ever committed a proceed-date line to that file. (For scale: `Claude` is the third-largest
> committer to `MASTER.md` at 17 commits.)

*Original finding follows.*

`MASTER.md:285` and `SalesOrderWorkspace.tsx:2162` both state:
*"`createOrderInput` refuses an order without one."* **Measured across all three layers — it does not.**

| Layer | proceed_date |
|---|---|
| UI `validateDraft(true)` (`:1339-1364`) | not checked |
| API `createOrderInput` (`orders.ts:1484`) | `z.string().regex(…).nullable().optional()` |
| RPC `sales_order_create` (`0374:60-73`) | raises for name, dealer, salesperson, SKU, qty, price — **never proceed_date**; inserts `nullif(…)::date` |

So an SO keyed on this screen can be born with `proceed_date = null`, and this same screen then
renders it read-only as `Not recorded` **forever**. `MASTER.md:287` already flags this 🟡 for
*imported* orders; it is not limited to imports. The read-only ruling rests on a premise that is
false at every layer.

### 🔴 F-6 · The two surfaces do not ask the same questions

`MASTER.md:288` — *"BOTH SIDES ASK EACH QUESTION THE SAME WAY."* Measured against
`POS_FORM_BUILTINS` (`schemas/order-entry.ts:224-247`):

| POS builtin | POS | This screen |
|---|---|---|
| `phone` | `locked`, `defaultRequired: true` | no `required`, not in `validateDraft` 🔴 |
| `address` | `locked`, `defaultRequired: true` | no `required`; only `building_type` validated 🔴 |
| `billing` | `locked`, `defaultRequired: true` | no `required` 🔴 |
| `emergency` | `defaultRequired: true`, toggleable | reads only `.enabled` — **`.required` is never read** 🔴 |
| `deliveryDate` | `locked`, `defaultRequired: true` | no `required` at create 🟡 |
| `proceedDate` | `locked`, `defaultRequired: true` | see F-5 🔴 |
| `orderAddons` | `locked` | hidden `<span>` — unaskable 🔴 |
| `email` | toggleable | ✅ honoured |

Only `email` actually reads its config `required` flag. The screen's own header claims *"Every
question the portal asks is here, rendered from the SAME `order_entry_config` contract."* It
renders the same *fields*; it does not honour the same *obligations*.

### 🔴 F-7 · `building_type` is load-bearing and has no column

`building_type` → **0 hits across all 403 migrations**. It lives only in
`orders.entry_data->'fields'->>'building_type'` — jsonb, no schema, no CHECK, no FK.

Yet `MASTER.md:4695` makes it one of only two things that **refuses** agreeing a delivery date,
and the delivery **slot length** is derived from its exact value (condo/apartment/office = half
day; landed/retail = full day). A free-text jsonb key decides how long a van is booked for.
A value written as `Condominium` where the option list says `Condo` would be silently unmatched.

### 🔴 F-8 · Floor — three layers, three different bounds

| Layer | Bound |
|---|---|
| UI (`:2197-2203`) | `min=0 max=3`, clamped to `[0, MAX_DELIVERY_FLOOR]` |
| API (`orders.ts:1467`) | `z.number().int().min(0)` — **no max** |
| DB (`0001:261`) | `int NOT NULL DEFAULT 1` — **no CHECK** |

The label promises `Floor (Max is 3rd Floor)`; only the browser enforces it. Also: the label
hardcodes the ordinal `rd`, so a future `MAX_DELIVERY_FLOOR` of 1 or 2 prints
`Max is 1rd Floor`.

### 🔴 F-9 · `Ordered` names two different things app-wide

On this screen `Ordered` is a **date label** (`orders.placed_at`).
`COPY-STANDARD:639` and `:701` make `Ordered` a **Purchase Order status word**.
Same word, two meanings, two surfaces — exactly what COPY-STANDARD rule 8 exists to stop.
`CS:1735` registers `Ordered` only as a measure word in a PO summary strip.

### 🔴 F-10 · `Showroom` here, `Outlet` there

`POS_FORM_BUILTINS` names the field `Outlet` (`order-entry.ts:225`). This screen labels the same
`orders.outlet_id` as `Showroom`. Neither word is registered in COPY-STANDARD for this field.
One column, two names, two surfaces.

### 🔴 F-11 · The promised date is guarded by ONE layer, not two

`apps/api/src/routes/operation/orders.ts:864-867` claims:
*"goods, price, `delivery_date` and attribution are NOT here, **and the RPC refuses them again on
its own side**."*

Measured: the RPC **hard-refuses attribution** (`0354:150-154`, raises `attribution_by_request`)
but `delivery_date` and `delivery_date_tbd` are **in its own write whitelist** (`0354:129`) and it
writes them (`0354:243-248`). It only demands a `p_change` cause for them (`0354:319-323`).

So the customer's promised date is kept out of the save door by the Zod `.strict()` **alone**.
Any other caller of `sales_order_save_revision` moves the promise without an Amendment and
without approval. Defence-in-depth is claimed and does not exist.

### 🔴 F-12 · Two doors, two policies, for one act

`update_order` (the POS/dealer door, `0222:92-103` / `0230:288-303`) **hard-refuses**
`delivery_date`, `proceed_date`, `delivery_date_tbd`, `delivery_floor`, `delivery_has_lift` and
`delivery_stair_items` once `status = 'proceed_order'` — *"Delivery fields are locked after Proceed."*

`sales_order_save_revision` has **no status lock of any kind**.

The same six delivery facts are frozen after Proceed at one door and freely writable at the other.
On this screen `Floor`, `Items needing stair carry` and `Lift available?` stay editable on a
proceeded order. Ownership Law C: *a door, never a duplicate* — two forms for one act.

### 🔴 F-13 · The floors evaluator is blind to half the fields this screen writes

`sales_order_floors` (`0328:57-66`) sorts changed fields into
`items / promise / money / attribution / contact`. **None of the seven fields 0354 added** —
`customer_race`, `customer_gender`, `customer_birthday`, `customer_address_unknown`,
`customer_billing_same`, `delivery_stair_items`, `entry_fields` — is classified. The safety gate
that is supposed to speak before any write does not recognise them.

### 🟡 F-14 · Retired capability: code and comments survive

`Copy to a new Sales Order` was retired 2026-08-28 (`MASTER.md:5032-5044`) — both doors and the
`?copyFrom=` route branch removed. Surviving:

- `apps/web/src/pages/operation/sales-order-copy.ts` — `copySalesOrderDraft`, **zero callers**
- `apps/web/src/pages/operation/sales-order-copy.test.ts` — its suite
- `SalesOrderWorkspace.tsx:1671-1675` — a comment claiming *"Copy already ships on the register's
  right-click menu"* — now false
- `SalesOrderWorkspace.tsx:149-151` and `:1336-1340` — comments `carry-forwards.md:30` already
  records as **both false**, now also describing a retired act

The parked hazard (`copy-sales-order-clones-a-promo-price-and-drops-its-reason`) is unreachable
today because the doors are gone — but the function whose attrs-dropping bug is *why* Jess called
the act dangerous is still compiled into the bundle. This is the `D10` pattern
(`MASTER.md` §12): a dead surface with a live test suite.

### 🟡 F-15 · `channel` is derived twice

`sales_order_create` owns the arithmetic (`0374:98`:
`case when outlet_id is not null then 'showroom' else 'dealer' end`).
`SalesOrderWorkspace.tsx:394` re-implements it for the document preview:
`channel: draft.outlet_id ? "showroom" : (base?.channel ?? "dealer")`.
Two arithmetics that currently agree — Law D's stated failure mode.

### 🟡 F-16 · A stale cross-reference in the MASTER

`MASTER.md:283` says *"This overwrites §725-728 below."* Lines 725-728 now hold the **money gate**,
not the proceed-date writer. The supersession itself is correctly recorded inline at `:818`, so no
obsolete ruling survives — but the pointer aims at unrelated text.

---

## 3 · `UNTRACED`

Every field whose source could not be established, and what was searched.

| Field | What was searched | Result |
|---|---|---|
| `building_type` | `grep -rn 'building_type' supabase/migrations/*.sql` → **0 hits** across 403 files. Then `entry_data`, `entry_fields`, `0219_order_entry_config.sql` | **Not a column.** Resolves to `orders.entry_data->'fields'->>'building_type'` — jsonb, no schema, no CHECK. Traced to a *path*, never to a *column*. See F-7 |
| `entry_fields` | Same sweep | **Not a column** — an RPC payload key mapping onto `entry_data->'fields'`. Correctly untraceable; recorded so nobody searches again |
| `order_lines.label` | `order_lines` filtered to `add column\|alter column`, all migrations | **No such column.** The TS type declares `label?: string \| null`; the API synthesises it via `resolveSkuLabels()` from `product_skus` + `product_models`. A type that names a column that does not exist |
| `docTitle` (#4) | — | DERIVED, no persistence. Traced, but governed nowhere |
| `Print ▾` menu | Read `openPrint()` `:1234-1246` | No menu exists. The `▾` affordance has no implementation to trace |
| the four `CustomFields` blocks | `order_entry_config` singleton → `form_fields` jsonb | Field *definitions* are operator data, so the value source is knowable but the **field set is not fixed** — no audit can enumerate them ahead of time. Recorded as structurally untraceable, not as a defect |

---

## 4 · `NOT REGISTERED`

101 visible strings were found absent from `docs/COPY-STANDARD.md`. **Because the refutation round
did not run, this list is tiered by how it was checked** rather than presented flat.

### Tier A — verified by hand, genuinely governed nowhere

`Full name` · `Phone` · `Email` · `Race` · `Gender` · `Birthday` · `Address line 1` ·
`Address line 2` · `State` · `City` · `Postcode` · `Pick a state first` · `Pick a city first` ·
`Required for delivery` · `Billing address` · `Name` · `Relationship` · `Item` ·
`Unit price (RM)` · `Create order` · `Back to current` · `Print ▾` · `New Sales Order` ·
`Viewing Rev {n} · read-only` · `Customer reference` · `Discard unsaved changes?` ·
every option value (`Malay` `Chinese` `Indian` `Other` `Female` `Male` `Spouse` `Parent` `Child`
`Sibling` `Relative` `Friend` `Colleague` `Helper`) · every `operationalConfig` label (`Size`
`Firmness` `Colour` `Fabric code` `Seat height` `Sofa height` `Configuration`
`Sofa configuration`) · every validation toast · every loading/error string.

### Tier B — governed by `docs/orders/MASTER.md`, absent from COPY-STANDARD

These are **not** unregistered words; they are words the dictionary does not carry.
Recorded because CLAUDE.md §2 names COPY-STANDARD as the authority, so the gap is real:

`Not recorded` (M:1040) · `Cancel SO` (M:1250, M:1334) · `Paid` (M:1239) ·
`Sales ownership` (M:268 — *and* CS:1461) · `Order info` (CS:1461) · `Goods` (M:1171) ·
`No lift` / `Has lift` (M:288) · `creates a Revision · needs approval` (M:259).

### Tier C — the machine pass flagged these; my hand-check disagrees

Recorded as **refuted**, not carried as findings:

| String | Agent verdict | Hand-check |
|---|---|---|
| `Total` | NOT REGISTERED | **CS:1735** registers it as a governed measure word. Correct verdict is 🟡 *"registered for a PO summary strip, not for this money label"* |
| `Ordered` | NOT REGISTERED | **CS:1735, :639, :701** all carry it — which is worse than absence, and is why it became F-9 rather than a copy gap |
| `Outstanding` | (correctly registered) | CS:1384 ✅ |

### The structural gaps worth naming separately

- **`Hide` · `Unsaved changes here` · `This section has unsaved changes` · `▸` · `▾`** — the
  collapsible-`Block` strings. `MASTER.md:256` **retired the fold** with the third merge pass;
  no card on this screen passes `summary`, so this copy is unreachable. Dead strings, not gaps.
- **`Discard unsaved changes?`** rides a native `window.confirm` — no token, no translation, no
  design system reaches it.

---

## 5 · `GATE MISMATCH`

Every place a UI gate and its API/RPC gate disagree. All re-verified by hand.

| # | Control | UI gate | API gate | RPC gate | Defect |
|---|---|---|---|---|---|
| **G-1** | `Change salesperson` (submit) | `principal \| hr` (`SalesOrderAttribution.tsx:99`) | `requireOperation` = `operation \| principal` (`orders.ts:1613`) | `operation \| principal` (`0329:63`) | **Near-disjoint.** `operation` — the role the API and RPC admit — never sees the button. `hr` sees a button that 403s at the route. Only `principal` is in all three |
| **G-2** | Approve · Reject · Apply · Take the approval back | **none** — render for every role reaching the screen | `requireAttributionLane` = `operation \| hr \| principal` (`orders.ts:1576`) | **refuses `operation`** (`0329:139`, `0336:85`) | An `operation` user is shown four buttons and 42501'd by the database every time. The file's own comment at `:280-285` claims the doors are gated; `canRequest` guards only the request button |
| **G-3** | `Request payment approval` | `operation \| salesperson \| principal` (`:731`) | **no middleware at all** (`payment-approvals.ts:56`) | `operation \| salesperson \| principal` (`0362:173`) | UI mirrors the RPC correctly, but `salesperson` **cannot reach the screen** (`App.tsx:128` admits `operation \| principal`) and **cannot read the row back** — RLS `is_internal()` excludes salesperson (`0266:103`). A salesperson could write a request they can never see |
| **G-4** ~~🔴~~ | `Approve` / `Refuse` | `principal` only (`:753`) | none | `principal` **OR** a holder of the `delivery_payment_approver` duty (`0362:133-145`) | **REFUTED 2026-08-28 — not a mismatch today.** The duty key **was never created**: `org_duties` is seeded with exactly six keys (`0260:30-41` + `0286:74-79`) and this is not among them; `org_position_duties.duty_key` is `references org_duties(key)` (`0260:46-51`) and `hr_set_position_duty` raises `duty_not_found` first (`0260:203-204`), so a holder row is **FK-impossible**. `DUTY_KEYS` is a closed 6-tuple pinned by test (`org-duties.ts:18-29`). The gate's duty branch is reachable but **unsatisfiable**, and fails closed. `delivery_payment_approver_gate()` is therefore behaviourally **identical** to `role = 'principal'`. The UI and the RPC admit exactly the same people. **The real gap is a missing seed row, not a UI policy** |
| **G-5** | the whole attribution lane | — | `hr` admitted (`orders.ts:1578`) and by three RPCs | `hr` admitted (`0329:144`, `0336:90`, `0335:41`) | `hr` is bounced at the **shell** — `App.tsx:128-130` wraps `OperationApp` in `RequireRole roles={["operation","principal"]}`. The GATE 3 approver lane has **no reachable UI for its designated approver** |
| **G-6** | `Save` (the promised date) | not offered | Zod `.strict()` omits `delivery_date` | **whitelists and writes it** (`0354:129, :243`) | Not a role mismatch — a **depth** mismatch. See F-11 |

**Correct by contrast, and worth recording:** `Save`, `Create order` and the payment-approval
`Reason` field. Each has the same rule stated at every layer. They are the pattern the rest of
the screen should follow.

---

## 6 · Claims that did NOT survive hand-verification

Recorded so nobody re-derives them.

| Claim | Source | Why it fails |
|---|---|---|
| *"`sales_order_save_revision`'s UPDATE branch silently drops `order_lines.attrs`"* | DB pass | **Refuted.** The UPDATE sets `sku`, `qty`, `unit_price` only (`0354:284-288`) — a column absent from a SET list is **preserved**, not dropped. The `queries.ts` comment (*"the SAVE door keeps a line's attrs by matching on id"*) is correct. Moot on this screen regardless: the route forces `p_lines: null` (`orders.ts:1476`), so lines never travel through Save from here |
| *"`Total` is NOT REGISTERED"* | Copy pass | **Refuted** — `CS:1735`. Downgraded to 🟡 (registered for a different surface) |
| *"`is_operation()` widening (0189) matters to this screen"* | Gates pass | **Refuted** — no Sales Order RPC calls it; 0327-0385 read `app_role()` directly |

---

## 7 · The three readers

`MASTER.md`-locked facts that only one of Tech / Sales / Operations can currently answer:

| Field | Tech | Sales | Operations | Verdict |
|---|---|---|---|---|
| `Items needing stair carry` | ✅ | ❌ *"what happens if I get it wrong?"* — nothing on screen says the number is clamped on one surface and not another | ❌ *"can I trust this number?"* — no, see F-2 | 🟡 |
| `Total` | ✅ | ❌ does it include the stair fee I just quoted? No, and nothing says so | ❌ | 🟡 |
| `Proceed date` | ✅ | ❌ *"what do I type?"* — nothing, on an existing order | ❌ *"may I change it?"* — no, and nobody can (F-5) | 🟡 |
| `Building type` | ❌ *"what breaks if it is null?"* — a delivery date cannot be agreed, but that is two documents away | ✅ | ✅ | 🟡 |
| `Floor` | ✅ | ❌ the ceiling is real in the browser only | ✅ | 🟡 |
| `Lift available?` | ✅ | ✅ | ❌ *"can I trust it?"* — `No lift` and *"nobody said"* are one stored value | 🟡 |
| `Outstanding` | ✅ | ✅ | ❌ excludes storage the Payments desk may include | 🟡 |

---

## 8 · QUESTIONS FOR YH

Only genuine business decisions. Everything else in this document is engineering and is not YH's.

### Q1 · Does the stair-carry fee form part of what the customer owes?

**Searched.** `MASTER.md` §THE MERGED ORDER TAB (:288-317), §8 Money on an order,
`order-money.ts`, `order-totals.ts`, `delivery-fee-recompute.ts:38`, every migration for a
`STAIR` addon key (0 hits), `stripe-checkout.ts:115`.

**Why authority does not settle it.** `delivery-fee-recompute.ts:38` states *"The floor STAIR
surcharge is a DIFFERENT charge and is KEPT — both fold into the order total."* But no code path
folds it into `orders.paid`, `order_addons` or `orderMoney`. `orders.ts:261` says the opposite:
*"stair is a delivery-time concern, not a sales metric."* Two in-repo statements disagree, and
the 2026-08-27 pricing ruling settled *how many items are charged* without settling *whether the
charge is collected*.

**Options.** (a) The fee is real revenue → it must become an `order_addons` row at create/save, and
`Total` then includes it. (b) The fee is a delivery-day cash collection → the working line belongs
on the Delivery document, not in `ORDER INFO`. (c) It is a quote aid only → say so on screen.

**Recommendation: (a).** The POS quotes it to the customer as money owed
(`draftTotals.grand` includes it), so a customer has been told a number the order does not carry.
Making it an addon closes the gap with the machinery that already exists for delivery fees.

**Operational consequence.** Every order with floor > 2 and no lift changes value. Finance's AR
moves. Under CLAUDE.md §6 no backfill is proposed — this binds new orders only.

### Q2 · Must an office-keyed Sales Order carry a Proceed date?

**Searched.** `MASTER.md:282-287`, `POS_FORM_BUILTINS` (`order-entry.ts:245`), `createOrderInput`
(`orders.ts:1478-1499`), `sales_order_create` (`0374:60-73`), `validateDraft` (`:1339`).

**Why authority does not settle it.** `MASTER.md:285` asserts the create door refuses an order
without one. F-5 shows no layer does. The read-only ruling rests on that premise, so the ruling
and the code cannot both stand. `MASTER.md:287` already anticipates the orphan for *imported*
orders and defers the fix — it does not anticipate this screen creating one.

**Options.** (a) Make it required at create (UI + Zod + RPC) — the read-only ruling then holds.
(b) Keep it optional and open the governed correction door `MASTER.md:287` names.
(c) Keep it optional and accept permanently unfixable orphans.

**Recommendation: (a).** It is what the MASTER already believes is true, it costs three lines at
three layers, and the production engine needs the date whenever a delivery date is set
(`order-entry.ts:243`).

**Operational consequence.** The office can no longer key an SO without naming a production start.
That is one more required answer at the point of office entry — which is what the POS already
demands of the shop floor.

### Q3 · Who approves a delivery payment — the principal, or the duty?

**Searched.** `MASTER.md:4493-4497`, `0362:133-145` (`delivery_payment_approver_gate`),
`SalesOrderWorkspace.tsx:733-736`.

**Why authority does not settle it.** The ruling and the database both say *principal **or** the
`delivery_payment_approver` duty holder* — the duty is DATA specifically so managers join without
a code change. The UI hard-codes `role === "principal"`, and its own comment concedes the
narrowing is deliberate-for-today. Whether "today" has ended is a business fact, not a code fact.

**Options.** (a) The UI reads the duty, matching the RPC. (b) Principal stays the only approver and
the duty branch is retired from the RPC. (c) Leave both, documented.

**Recommendation: (a).** The database already admits duty holders, so today a manager Carres has
appointed is authorised and cannot act. That is the mismatch, not the code.

**Operational consequence.** Whoever holds `delivery_payment_approver` starts seeing Approve /
Refuse. If nobody holds it, nothing changes.

---

## 9 · What this audit did not cover

- ~~The child components were read for gates only~~ → **CLOSED 2026-08-28, see §10.**
- ~~Order Route, Revisions and History are separate surfaces~~ → **CLOSED 2026-08-28, see §11.**
- **Add-ons cannot be amended** (`amendmentSubmitInput` is `.strict()` over four keys while the
  governing doc files them Class A) is KNOWN-OPEN and belongs to its own task. Row #87 records the
  related fact that they cannot be *created* here either.
- `ServiceCaseWizard.tsx` remains out of scope — it is Service's object, not this screen's.
- No production database was queried. Every column fact comes from `supabase/migrations/`.
  *(The migration tracker was checked by YH on 2026-08-28: top row `0390`.)*

---

## 10 · THE CHILD COMPONENTS — gap closed

36 rows walked across `SalesOrderAmendment` · `SalesOrderAttribution` ·
`SalesOrderAmendDeliveryDate` · `CorrectionWorkList` · `CancelSalesOrderDialog`.

**The model row of this whole audit** is here, and it is worth naming because everything else is
measured against it: `Management decision reason` is registered at **CS:1651**, and the *same
rule* is stated at the UI, the route, the RPC **and** a table CHECK constraint
(`sales_order_amendments_decision_complete`). Four layers, one sentence. That is what the rest of
this screen should look like.

### 🔴 Findings

| # | What | Why |
|---|---|---|
| **C-1** | `Promised delivery` on the amendment modal | **CS:1282 / CS:1365** retired this word on 2026-08-27 and banned it *from reuse*. CS:1288-1290 says the ban is by **meaning**, so a respelling does not escape it. The ruled word is `Requested Delivery Date` |
| **C-2** | `Promised today — {date}` hint | Same ban. `Promised` is named in CS:1365's Do-NOT-use column for this exact column |
| **C-3** | **Instalment months has no bound above the database** | `orders_installment_months_chk` allows only NULL/6/12 (`0007:44-51`). The Input is a free integer, Zod is `.int().min(0)`, and the RPC writes it raw. Type `9` → the proposal saves → **the principal presses Approve** → 23514 → neither error mapper handles it → **HTTP 500 with the raw constraint text on screen**, at the approver's press, not the proposer's |
| **C-4** | `{raw server error message}` on both mutations | Unfiltered pass-through. For C-3 it prints `new row for relation "orders" violates check constraint …` to the operator |
| **C-5** | **The amendment reason is required at two layers, not three** | UI requires it, the API requires it (*"An amendment says why"*), the **RPC does not** — it stores `nullif(trim(…))` into a nullable column with no raise. Every sibling reason in this family *is* enforced at the RPC (`0329:66`, `0336:63`, `0350:224`, `0348:193`). CS:1501 marks the field `(required)`. Any other caller records a contractual proposal with no stated cause |
| **C-6** | **A future `Requested date (from customer)` is silently discarded** | The client sends `null` instead of the date. The RPC refuses a future day **by name**, with a governed sentence — so the UI throws away the operator's answer to avoid an error that would have taught them something |
| **C-7** | **`New delivery date` has no lead-time floor** | The create door on the same screen refuses a too-soon date using the catalog lead. This door — which moves *the same customer promise* — applies no floor at all |
| **C-8** | `{Purchasing\|Delivery} closes this — the sales order raised it.` | Names a closer the system cannot authenticate: neither is an `app_role` value, and `correction_work_close` admits only operation/finance/principal |
| **C-9** | `Propose a change to the customer` idle strip | **Dead on this surface** — the workspace mounts with `inlineTrigger={false}`, so this governed string has no reachable render path here |

---

## 11 · ORDER ROUTE · REVISIONS · HISTORY — gap closed

143 rows. **No UI role gate exists on any of the three** — Order Route is read-only by
construction across all 804 lines, and the Ledger has no role check. So none of §5's G-1..G-5
mismatches can recur here; there is no client gate to diverge.

### 🔴 The Route contradicts the dictionary about money and dates

**CS:1400 states the rule outright**: the gate, the canvas, the object page, the drawer and the DO
document *all read these sentences from the shared modules*. The Route re-implements them instead.

| # | What | Why |
|---|---|---|
| **R-1** | `RM {amount} still outstanding — collect, or request a payment approval` | Not the CS:1411 sentence. Retyped, not imported |
| **R-2** | `Finance is holding this delivery for {n} reasons — Finance clears them` | **The reasons vanish.** The shared `financeExceptionReason()` *names* them; this drops the list |
| **R-3** | `Factory ready: {date}` | CS:1622-1633 is the Route's own exhaustive date table, and `expected_ready_date` has exactly one row there: **`Estimated ready: {date}`**. One fact, two spellings, on one canvas |
| **R-4** | `Unassigned` | **CS:1547 lists it in Do-NOT-use for this exact surface** — and it is not an edge case: the page supplies only `purchasing` and `receiving` owners while `ownerOf` reads six keys, so every stock/delivery/sales node prints it |
| **R-5** | `collect back` loan edge label | **Never reaches the screen** — the presentation fold rewrites every edge with `labelAt: null` |
| **R-6** | Two predicates retyped on the canvas | `paymentApprovalOpensGate` and `financeExceptionHolds` are re-implemented inline, while the file's own comment claims it asks the shared one. They agree today — **Law D's exact stated condition** |

### 🔴 The Ledger's empty sentence is also its error state

| # | What | Why |
|---|---|---|
| **R-7** | `No revisions recorded` / `No history recorded` | The Revisions/History branch has **no loading guard and no error guard** — unlike the Order Route branch fifteen lines above, which has both. A 403, a 500 or an expired token prints the governed *empty* sentence. **A permission refusal renders as a factual claim about the order** |
| **R-8** | `Actor was not recorded` | **The governed word exists and this is not it.** `ui/MASTER.md:718` (Staff Identity Law, owner-approved/LOCKED 2026-08-27, Jess) rules **`Staff identity not recorded`** |
| **R-9** | `Recorded by System · {when}` | **Unreachable.** The revisions endpoint calls `actorKindOf` with no third argument, and `system` can only be returned by reading `metadata.actor` |
| **R-10** | `Promised delivery: {old} → {new}` · `Promised delivery TBD` | Banned words (CS:1365/CS:1282), built on the name retired 2026-08-27 — while the *same component* prints the ruled word one rank above |
| **R-11** | `Lift: Yes → No` · `Lift available: …` | **CS:1513** names both in Do-NOT-use; **CS:1514** bans `Yes/No` for this fact and rules `No lift` · `Has lift` |
| **R-12** | `Stair-carry items` | **CS:1516** names it in Do-NOT-use; the ruled label is `Items needing stair carry` |
| **R-13** | **Seven savable fields produce a SILENT diff** | `customer_race`, `customer_gender`, `customer_birthday`, `customer_address_unknown`, `customer_billing_same`, `delivery_stair_items` and `entry_fields` change the order and appear in **no** History line — while `MASTER:1142` asks History for actor, time, reason, Before and After. Note this is the *same seven fields* §2 F-13 found the floors evaluator blind to |

### 🟡 One gate note

`GET /:id/revisions` sits on `requireOperation` (operation|principal) while the table's own RLS
admits operation|principal|finance|hr|bd. Not a live leak — those roles cannot open the workspace
at all — but `0327`'s policy states an access intent no door honours.

---

## 12 · NEW GATE FINDING — G-2b

§5's G-2 said *"an operation user is shown four buttons and 42501'd every time."* **True of three,
false of the fourth.**

`Apply the change` is gated the **opposite** way to its three neighbours in the same panel: the
route is `requireOperation` and the RPC admits operation|principal. So `operation` **can** complete
Apply — the only one of the four it can — while `hr`, the role the footnote directly above the
button names as the approver, is 403'd at the route before the database is reached. Its refusal
then arrives as `requireOperation`'s generic *"operation or Principal only"* rather than the GATE 3
sentence — which is precisely what the withdraw route was written to avoid.

G-1, G-2 and G-5 were each re-verified line by line and **all still hold** (one line reference
drifted: the attribution route is now `orders.ts:1619`).

---

*No application code was changed by this audit. The Q2 proceed-date build is a separate PR.*
