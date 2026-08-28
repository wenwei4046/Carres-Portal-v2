# SALES ORDER WORKSPACE — LINE-BY-LINE FIELD AUDIT

**Lane:** REVIEW · reports, does not fix.
**Surface:** `apps/web/src/pages/operation/SalesOrderWorkspace.tsx` (2,954 lines), serving
`/operation/orders/so/:orderId` (modes `object` + `oldrev`) and `/operation/orders/so/new` (mode `create`).
**Branch:** `dev_branch_yh` · **Date:** 2026-08-27

> **Route note, confirmed.** Bare `/operation/orders/so` has no route. `OperationApp.tsx:419-420`
> registers exactly `orders/so/new` and `orders/so/:orderId`. Nothing else resolves.

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
| 57 | `Amend delivery date` | ORDER INFO | button → Modal | `sales_order_submit_amendment` | AM | operation\|principal | M:1230 | OK — door sits beside the fact it moves |
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

### 🔴 F-2 · The stair fee — two defects in one field

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

### 🔴 F-5 · The office create door can birth the orphan only it could have prevented

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
| **G-4** | `Approve` / `Refuse` | `principal` only (`:736`) | none | `principal` **OR** any active non-dealer position holding the `delivery_payment_approver` duty (`0362:133-145`) | **UI is narrower than the law.** The duty is DATA precisely so managers join without a code change (M:4495). A duty-holding manager is authorised by the database and will never be shown the button |
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

- `SalesOrderAmendment.tsx`, `SalesOrderAttribution.tsx`, `SalesOrderLedger.tsx`,
  `CorrectionWorkList.tsx`, `CancelSalesOrderDialog.tsx` and `ServiceCaseWizard.tsx` were read for
  their **gates and their mounted strings**, not audited field by field. Each is a separate object.
- **Add-ons cannot be amended** (`amendmentSubmitInput` is `.strict()` over four keys while the
  governing doc files them Class A) is KNOWN-OPEN and belongs to its own task. Row #87 records the
  related fact that they cannot be *created* here either.
- The Order Route, Revisions and History views are separate surfaces.
- No production database was queried. Every column fact comes from `supabase/migrations/`.

---

*No application code was changed. No PR was opened.*
