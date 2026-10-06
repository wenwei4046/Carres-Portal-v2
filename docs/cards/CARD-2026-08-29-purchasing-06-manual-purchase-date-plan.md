# PURCHASING — CARD 06 · MANUAL PURCHASE DATE PLAN

**Card path:** `docs/cards/CARD-2026-08-29-purchasing-06-manual-purchase-date-plan.md`
**Module:** Purchasing · **Sequence:** 06
**Page:** Manual Purchase
**Surface:** Create form dates, daily-work/filter rail, permanent Register, object facts,
Work Engine hand-off and PO Delivery Date hand-off
**Status:** EXECUTED — SHIPPED AND DEPLOYED 2026-08-30; production-verified on merge
`87ef0e2812fc80271d1e527f74513571b32466e9` (completion evidence in §12)
**Lane:** BUILD / DELIVERY
**Depends on:** Card 05 production truth (PR #984, merge `a43de3b7`) and latest `main`
`69600271`; the shared Purchasing/Receiving seam dated 2026-08-29
**Expected migration:** NONE. `purchase_requests.created_at` already holds the actual hand-off
time and `purchase_requests.required_by` already holds the requested arrival date. `Order By` is
derived. Stop and report before adding a store, status column or second writer.

---

## 1 · Outcome

Manual Purchase must use the same two visible date meanings as the Sales Portal:

```text
Proceed Date  = when the request header was actually sent into Purchasing
Delivery Date = when the supplier's goods must reach Deliver To
```

The system uses the existing Purchasing Settings lead days to propose Delivery Date and to derive
the internal `Order By` date that tells staff whether they can order early, must order now or are
late. Staff never calculate a lead time and the browser never guesses one.

This Card corrects the date words and the daily-work lens only. It keeps Card 05's shipped
full-width object and approval authority, Card 04's one selected Register `Issue PO` placement,
the one governed PO writer and the one shared Receiving engine.

## 2 · Resolved from authority

Read before build: `CLAUDE.md` · `docs/ERP-ARCHITECTURE.md` · `docs/ui/MASTER.md` ·
`docs/COPY-STANDARD.md` · `docs/ACTION-FLOW-STANDARD.md` · `docs/purchasing/MASTER.md` ·
Cards 02-A/02-B/02-C/03/04/05 · current Manual Purchase web/API/shared/SQL/tests ·
`packages/shared/src/purchasing-settings.ts` · current central Work and Purchase Order authority.

| Current Carres | SO / mature ERP lesson | Decision | Card 06 answer |
|---|---|---|---|
| `Requested Date` is `created_at` | The same hand-off fact already reads `Proceed Date` in SO Batch | **ADAPT** | Rename the visible Manual fact to `Proceed Date`; keep its actual, immutable meaning |
| `Needed By` is typed with no default | Required arrival must be planned from governed lead time | **IMPROVE** | Rename it `Delivery Date` and default it from Settings |
| Manual Purchase has no order-date arithmetic | Staff need a stable order-by fact, not a vague late flag | **IMPROVE** | Derive line `Order By`; request timing is the earliest line date |
| The rail hides daily actions and timing | The SO rail begins with concrete work and then timing | **ADAPT** | Add `WORK TO DO`, `ORDER TIMING` and conditional setup facts using Manual truth |
| Issue-time ETA is recalculated from today | An approved request date must survive into the supplier commitment | **REJECT** | Manual PO Delivery Date comes from the approved MPR Delivery Date |
| One Manual batch may contain different required dates | One PO has one official supplier-facing delivery date | **IMPROVE** | Delivery Date joins the Manual document partition; different dates create different POs |

## 3 · One date contract

### 3.1 Proceed Date — an actual fact

- `Proceed Date` is the Malaysia calendar date of `purchase_requests.created_at` after the
  successful `Send for approval` header transaction.
- Before Send, the form may preview the server's current Malaysia date. After Send, the stored
  server time is authoritative and the date is immutable.
- It is not the approval date, PO issue date, requested arrival date or calculated `Order By`.
- It is the Manual counterpart of the actual SO hand-off fact, not a new stored column.

### 3.2 Delivery Date — the requested supplier arrival

- `Delivery Date` replaces visible `Needed by` / `Needed By` everywhere.
- It is when the supplier's goods must reach the selected `Deliver To`, not customer delivery,
  physical receipt time or a later supplier-changed promise.
- It remains stored in `purchase_requests.required_by` and each line's existing `required_by`.
- After all selected live items resolve Catalog Supplier × Product Category and complete Settings,
  the server proposes each line's arrival from the preview Proceed Date. The form defaults to the
  latest line arrival so every selected item can meet the one request date.
- A person may move Delivery Date. Once changed, the person's date is preserved; adding/removing an
  item recalculates `Order By` but never silently overwrites that chosen date.

### 3.3 Order By — the planning fact

For each live line, use one shared server arithmetic:

```text
Delivery Date
− supplier transit working days on the Office calendar (Mon–Fri)
− Supplier × Category production working days on that supplier's calendar
= Order By
```

Sunday and Selangor public holidays are excluded by the existing calendar authority. Recorded
Proceed Date and Delivery Date are never silently moved. With several lines, the request's
`Order By` is the earliest line date because the first item that must start governs the request.

Manual Purchase does not subtract Sales Order Safety days. Its Delivery Date is already goods
arrival at Carres; SO Safety days bridge goods arrival to a customer's Requested Delivery Date.

### 3.4 Missing Settings

No production or transit number means no proposed Delivery Date and no Order By. Never substitute
zero or a browser date. The create form blocks Send until the owner fact is repaired:

```text
Production days are not set
Add production days for {supplier} · {category} in Settings

Transit days are not set
Add transit days for {supplier} in Settings
```

Disabled action: `Send — lead days are not set`.

Legacy requests and requests affected by a later Catalog/Settings change stay visible and enter the
rail's setup facts; they are never deleted or assigned a guessed date.

## 4 · Create workspace

Keep the approved Sales Order form grammar and the full available width; no floating narrow card,
right-side preview or duplicate page title. The header facts are:

```text
Need for        Deliver to
Proceed Date    Delivery Date
Raised by       [purpose-specific For field when governed]
```

- `Proceed Date` is read-only. Before Send it shows the server preview; after Send it is actual.
- `Delivery Date` is the only date input. It defaults after item lead facts are complete.
- Routine purposes still ask no free-text Why. `Other Purchase` alone asks
  `What is this for?`; line `Note` remains optional.
- Supplier remains Catalog-derived. Operation never selects supplier or price.
- `Send for approval` remains the one submit action; approval and PO issuance stay separate.

## 5 · Final 240px left rail

Use the shared `FilterRail` shell and `NavRow` grammar. Labels wrap; counts are right-aligned;
the rail scrolls vertically and never shrinks below 240px. Seven sections, exactly:

```text
WORK TO DO
  Approve purchase
  Issue PO
  Check the supplier
  Add production days
  Add transit days

TO ORDER
  All not ordered

ORDER TIMING
  Can order early
  Order date reached
  Order date passed

PURCHASE PURPOSE
  All purposes
  Ready Stock
  Showroom Display
  Service Case
  Internal Staff Purchase
  Subsidiary Purchase
  Other Purchase

PRODUCT
  All products
  Mattress
  Bedframe
  Sofa

SUPPLIER
  All suppliers
  [actual supplier names, dynamic and alphabetical]

SETUP TO FIX
  Production days not set
  Transit days not set
```

- `WORK TO DO` is an action lens over the same server facts, not a second Work Engine. It shows all
  five rows, including zero. `Approve purchase` is undecided approval owned by the configured real
  approver (Jess today); `Issue PO` is approved remaining demand owned normally by PO Duty/cover.
- Everyone who may read Manual Purchase may use the action rows as filters. The filtered row/object
  names the real owner; clicking a filter never grants its approval or PO permission.
- `Need approval` and `Ready to order` retire from `TO ORDER`; their capability moves without
  duplication to `Approve purchase` and `Issue PO`.
- `ORDER TIMING` reads request `Order By`: today before / equal / after. It is a filter and fact,
  not an issue permission gate; an authorised person may buy early.
- `Check the supplier` names a live Catalog supplier gap. `Add production days` and
  `Add transit days` name their exact missing Settings fact.
- `SETUP TO FIX` renders only when an affected request exists. It states missing configuration;
  the owning action stays in `WORK TO DO` and deep-links Settings.
- Counts are unique MPRs and cross-compute with the other active sections. One filter per section;
  sections combine with AND. The complete permanent history is the no-filter population.
- Banned rows stay banned: `Supplier not selected` · `No supplier` · `Not in catalog` ·
  `Need price` · `Ordered` · `Part received` · `Received` · `Arrived` · `Cancelled` ·
  `My drafts` · `Need correction` · `Queues` · every Safety-days row.

## 6 · Permanent Register and object

The Register keeps eleven business columns, now exactly:

```text
Proceed Date · Approval Status · Manual Purchase No · PO No · Delivery Date ·
For · Items · Qty · Supplier · Deliver To · Requested By
```

- No-filter default remains newest Proceed Date first. A work/timing lens sorts earliest Order By
  first, then newest Proceed Date, so the most urgent visible request is first.
- Proceed Date and Delivery Date use the same fact/copy in the create form, Register and object.
- The object Request section becomes:
  `Proceed Date · Delivery Date · Need for · For · Deliver To · Requested By`.
- When calculable, show the quiet timing fact `Order by {fmtDate}` under Delivery Date. If passed:
  `Order date passed` then `Order by {fmtDate}`. Do not add an Object Issue PO button.
- The actual request time remains in History as `Purchase requested`; no separate Requested Date
  parent column survives.
- A historical null Delivery Date prints `Not recorded` and has no invented Order By. It stays in
  permanent history; this Card does not silently backfill or add an ungoverned post-approval edit.

## 7 · Work Engine and PO hand-off

- Undecided approval emits `Approve {MPR}` for the configured approver, due no later than Order By,
  deep-linking the exact MPR. Approval completion is the stored decision, never opening a page.
- Approved remaining demand emits `Issue the purchase order for {MPR}` for normal PO Duty/dated
  cover; Operations Superusers may act. Due date is Order By; completion requires the current PO
  version's confirmed-sent evidence, not merely a numbered PO or opened WhatsApp/email.
- My Work/Team Work own person, cover and late state. The Manual rail is only a filter over the same
  action identities and completion facts.
- Manual selected issuance uses the existing governed PO API/RPC. Its partition is
  `Supplier × Category × Deliver To × Purpose × Delivery Date`; different Delivery Dates must show
  the correct `Issue {p} PO(s)` count and create separate POs.
- The new PO's official `PO Delivery Date` is the approved Manual Delivery Date. Do not recalculate
  it from the issue day. A later supplier change records `Supplier Delivery Date` while preserving
  the original PO Delivery Date.
- The issued PO flows to the one Purchase Orders Register and one Receiving engine. There is no
  Manual receipt lane or second PO writer.

## 8 · Permission boundary

- Requester/Operation may create and submit but does not approve or control price.
- The principal or real configured `ops_manager` duty holder decides; Jess may approve a request
  for herself. The shared `operation@` login does not gain approval controls merely by this Card.
- Normal PO Duty/cover owns issuance work; governed Operations Superusers may use the same door.
  Preserve the actual actor separately from normal owner/cover.
- No date, rail or Work calculation broadens SQL authority.

## 9 · Build boundary

Expected files are limited to the existing Manual Purchase and shared planning seams:

- `packages/shared/src/purchasing-settings.ts` — one forward and inverse date planner;
- `packages/shared/src/manual-purchase.ts` — words, date/rail facts, counts and tests;
- `apps/api/src/routes/operation/manual-purchase.ts` — server date projection, plan and issue
  revalidation, with focused tests;
- `apps/web/src/pages/operation/OperationManualPurchase.tsx` — create form, rail, Register and
  object projection, with focused tests;
- the existing owning-module Work adapter only if required to expose the two action contracts;
- `docs/COPY-STANDARD.md`, `docs/purchasing/MASTER.md` and this Card's completion evidence.

Do not add a migration, new page, new table engine, new Settings page, new PO/receipt endpoint or
browser-only working-day arithmetic.

## 10 · Acceptance contract

1. A successful request-header Send records one immutable Proceed Date from server `created_at`.
2. Complete line Settings default Delivery Date from the slowest line using the server calendar.
3. Editing Delivery Date preserves the chosen value and recomputes every line plus earliest request
   Order By; multi-supplier/multi-category tests prove both calendars.
4. Missing production/transit days produce no guessed date, block Send with the governed wording,
   and appear in the exact Work/setup rail facts when an existing request is affected.
5. The rail renders the exact seven sections, unique-MPR counts and AND-combined filters at 240px.
6. The Register/object use the corrected two date columns/facts and no Requested Date/Needed By.
7. Approval/Issue Work actions have exact owner, due date, deep link and completion fact; no manual
   Done and no local duplicate queue.
8. Issuing requests with two Delivery Dates reports and creates two POs; each PO saves its matching
   official Delivery Date through the existing writer.
9. Approval, price, PO Duty/Superuser and Receiving permissions remain unchanged.
10. Focused shared/API/web/Work tests, full repository tests, typecheck, design-standard, migration
    CI, production build and `git diff --check` pass before merge.
11. After merge, all production entry points converge on the merge SHA; authenticated walks prove
    the create default, Jess approval, PO Duty issue, late timing and one Receiving hand-off.

## 11 · Owner Decision Gate

No owner question remains before build. The Owner supplied the controlling rule: align the visible
Proceed Date and Delivery Date with Sales Portal meaning, and calculate purchasing timing from
Settings lead days. Existing stores, calendars, permissions and one-writer boundaries resolve the
rest. If implementation discovers that a date cannot be projected from these existing facts
without a migration or a second authority, stop and return that concrete contradiction; do not
invent a fallback.

---

## 12 · Completion evidence — 2026-08-30

**Built on this Card's own branch** `codex/manual-purchase-06-date-plan` from `f9a586bd`
(= `main@69600271` + the Card). Implementation commit `002bd48d`; PR
[#987](https://github.com/wenwei4046/Carres-Portal-v2/pull/987); merge
`87ef0e2812fc80271d1e527f74513571b32466e9`. **No migration** — `created_at` and
`required_by` carry both facts; `Order By` is derived; no store, status column or
second writer was added.

### What shipped, against the boundary (§9)

- `packages/shared/src/purchasing-settings.ts` — `orderByFromDeliveryDate`, the ONE
  inverse of the frozen `expectedArrivalOf` (transit on the Office week, production
  on the factory week, same injected holiday set; round-trip tested against the
  forward planner). Null is a real answer.
- `packages/shared/src/manual-purchase.ts` — the corrected words (`Proceed Date` ·
  `Delivery Date`; `Requested Date`/`Needed By` retired; `Send — lead days are not
  set` · `Not recorded` · `Order date passed` · `Order by {date}` · the two
  missing-Settings facts), the seven-section rail contract with unique-MPR
  AND-combined counts, the timing arithmetic, the earliest-line `Order By`, the
  work/timing lens order, the Delivery-Date document partition, and the two Work
  action contracts (`manualPurchaseWorkItems`).
- `apps/api/src/routes/operation/manual-purchase.ts` — the server date projection
  (`withDatePlan` stamps every line's `delivery_date` · `order_by` · exact missing
  Settings facts; `todayIso` is the server's Malaysia date), the create form's
  `POST /plan` (Proceed preview + slowest-line Delivery Date proposal, ONLY when
  every asked SKU resolves with complete Settings), Delivery Date required on the
  header door, per-PO current-version confirmed-sent evidence, and issue
  revalidation: partition `Supplier × Category × Deliver To × Purpose × Delivery
  Date`, with each PO's official `eta_date` = the approved Manual Delivery Date —
  the issue-day recalculation is deleted.
- `apps/web/src/pages/operation/OperationManualPurchase.tsx` — the corrected create
  header (read-only server Proceed preview, one Delivery Date input that defaults
  from the plan and preserves a chosen date, named lead-day facts deep-linking
  Settings), the seven-section rail, the eleven corrected columns (null Delivery
  Date prints `Not recorded`), the work/timing lens sort, the object's corrected
  Request facts with the quiet timing line, and the `?mpr=` deep-link entry.
- `apps/web/src/pages/operation/use-open-work.ts` + `OperationWork.tsx` — the two
  Manual Purchase actions join My Work / Team Work through the one existing
  `WorkItem` grammar; a row deep-links the exact MPR. No manual Done, no local
  queue, no second completion store.

### Acceptance gates (§10)

1–9 covered by focused tests: shared **2,801**, api **2,583**, web **3,631** — all
green; plus typecheck, `ci:migrations` (416 filenames, 0 changes),
design-standard lint, production build and `git diff --check` (gate 10). GitHub CI
`verify` passed on PR #987 (run 33291911202).

### Production verification (gate 11) — merge SHA, authenticated

All five entry points converged on the exact merge SHA
`87ef0e2812fc80271d1e527f74513571b32466e9` (`__carres_deploy.json` on
carres-portal/carres-pos Pages + both canonical domains; API `/health`), and the
served ERP bundle carries the Card's words (`Proceed Date`, `Send — lead days are
not set`, `Order date passed`, `SETUP TO FIX`, `Transit days not set`,
`Issue the purchase order for `, `Not recorded`).

Walked authenticated on the live `operation@carres.com` account, 2026-08-30:

- **Register** — the eleven corrected columns; the real `MPR-20260829-2779` reads
  `Proceed Date Sat, 29 Aug` · `Delivery Date Mon, 31 Aug` · `Not ordered yet` ·
  `Need approval` with `Jess approves`.
- **Rail** — the exact seven sections at 240px; `WORK TO DO` shows all five rows
  with live counts (`Approve purchase 1`, zeros included); `ORDER TIMING` derived
  `Order date passed 1` from the live Settings lead days, and clicking it filtered
  to exactly that request (late-timing walk). `SETUP TO FIX` honestly absent — no
  affected request exists.
- **Object** — Request reads the Card's six facts in order with `Order date
  passed` then `Order by Tue, 11 Aug` under Delivery Date; the shared login sees
  the approval facts with NO controls and NO money (the §8 boundary rendering
  exactly as the SQL door would answer); `Requested By` stays
  `Staff identity not recorded`.
- **Create default** — the form previews the server's `Proceed Date Sun, 30 Aug`
  read-only and blocks with `Send — pick a date`; picking `5539-1NA · Booqit`
  (Supplier: Ohana) made the SERVER propose `Delivery Date Fri, 18 Sep` from the
  configured production + transit days with no typed date, and
  `Send for approval` went live. Cancelled — no walk row was minted.
- **Work hand-off** — Team Work groups **Jess · 1 action to do · 1 late** with
  `Approve MPR-20260829-2779 · Late — was due Tue, 11 Aug` (due = Order By,
  Office-calendar lateness), and the row deep-links the exact MPR object.

### Owner walks that remain Jess's (per the governed acceptance boundary)

The role-gated acts cannot be truthfully performed from the shared login — the
walk itself proved they do not render for it. Their doors are covered by the API/
SQL contract tests and Card 05's production-verified approval authority:

1. Jess approves (or refuses) `MPR-20260829-2779` on the object — the approved
   Delivery Date will then drive `Issue PO`.
2. PO Duty selects requests with two different Delivery Dates — the bar reads
   `Issue 2 POs` and each PO saves its own approved `PO Delivery Date`.
3. The issued Manual PO appears in `Purchase Orders` and is received through the
   one Receiving engine — no Manual receipt lane exists to find.
