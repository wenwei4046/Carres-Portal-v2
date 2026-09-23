# Sales Order object page — reconciled acceptance checklist

**Produced before any code change, 2026-09-23.** Supersedes the first draft of this file, which was
built on the wrong document.

---

## 0 · MY ERROR, AND THE EXACT DIFFERENCE

I cited "the current Orders MASTER" while reading the **working-tree copy on this branch**, which is
stale and modified. Measured:

| File | Working tree (branch `docs/delivery-03-closure`) | `origin/main` |
|---|---|---|
| `docs/orders/MASTER.md` | **4,927 lines** | **5,972 lines** |
| `docs/COPY-STANDARD.md` | **2,176 lines** | **4,124 lines** |

The rulings I said did not exist are all in `origin/main`:

| Section | `origin/main` line |
|---|---|
| `## Order view — one page, foreign facts read-only` | 525 |
| `CARD ORDER AND NAMES — OWNER RULING (Jess, 2026-09-21)` | 561 |
| blue `kit-blue-11` headings — *"remain blue"* (2026-09-22) | 576 |
| `THE SO PAGE FIELD STANDARD — OWNER RULING (Jess, 2026-09-22)` | 667 |
| `#### Its section names` (COPY-STANDARD) | 2440 |

**Three claims in my first draft are withdrawn:**
1. "A blue card title has no authority" — **false.** It is an explicit owner ruling, twice.
2. "Neither set of card words is law" — **false.** `SO info`, `Items`, `Payment`, `Customer`,
   `Delivery` are all registered in COPY-STANDARD § *Its section names*.
3. "Use the August *view presents facts* wording" — **wrong instrument.** The September field
   standard governs: a grey box means *this can be changed with Edit*, with three exceptions.

One thing in the first draft stands: **the four tabs stay.**

---

## 1 · Sources, pinned

| Source | Revision |
|---|---|
| Orders MASTER · COPY-STANDARD | `origin/main` (read with `git show`, never the working tree) |
| UI authority | `docs/ui/MASTER.md` · `02-components.md` · `03-page-patterns.md` on `origin/main` — **module-specific rulings are not invalidated by absence here** |
| Approved preview | `plan/so-page-proposal-preview` @ `caa51728d`, blob `c0046d617` (artifact `6Pss7aYTqPZFC55HUnGGFy`) — illustrative, never authority |
| Live page | `SalesOrderWorkspace.tsx` on `origin/main`, deployed `f79e97b70` |
| Reviewer findings | 16, observed on production **SO-1365**, compared with fetched main |

---

## 2 · PRESERVE — locked, and not reopened by this work

- **The four views: `Order · Revisions · History · Order Route`**, identity/header across all four.
- **The delivered Amendment safeguards:** server-chosen `Save` vs `Submit amendment request` ·
  the customer-agreement gate (three governed kinds, terms fingerprint, `customer_agreement_required`
  / `customer_agreement_stale`) · version-conflict (`base_header`, `amendment_stale`) · payment
  ownership · historical documents and **stored issued files** (`0565`) · a new version never
  inheriting an older signature · `TOTAL PAYABLE` · `Not in catalog {n}` · gift-line protection.
- **One arithmetic:** every printed total reads `orderMoney({lineSum, addonSum})`, never a re-sum.
- The collapsible fold stays retired; `Delivery Journey` and `Related Documents` stay off this tab.

---

## 3 · THE SCOPE — the 16 findings, each against its ruling

| # | Finding (production SO-1365) | Governing ruling | To build |
|---|---|---|---|
| 1 | Order is `Customer → Order info → Delivery → Goods → Money` | CARD ORDER AND NAMES 2026-09-21 | **`SO info → Customer → Delivery → Items → Payment`** |
| 2 | Dark uppercase headings on grey-blue bands | same §, and *"remain blue"* 2026-09-22 | **card title 15px/600 sentence case, `kit-blue-11`, on a white card with a 1px rule**; band retired |
| 3 | Dealer · Sales Location · Salesperson sit in `Customer` under `Sales ownership` | same § + COPY § Its section names | **move into `SO info`; retire the `Sales ownership` heading** |
| 4 | Labels `SO Date` · `Showroom` · `Requested Delivery Date` | same § (*"showroom is sales location"*) | **`SO Doc Date` · `Sales Location` · `Customer Requested Delivery Date` · governed `Proceed Date`** |
| 5 | Billing relationship/address in `Delivery` | same § | **move to `Customer`** (in-card `Billing`) |
| 6 | `Delivery` still has `Delivery address` / `Delivery access` headings | same § | **ONE group, no in-card headings** |
| 7 | Access order floor → stair qty → lift | same § | **floor → lift → items needing stair carry**, then the stair working line |
| 8 | View shows Category · Unit ID · SKU · Qty · Item · Deliver To · Unit price · Line total | ITEMS ruling 2026-09-21/22 | **`# · Item Code · Description · Qty · Unit (RM) · Disc (RM) · Amount (RM)` + closing `TOTAL PAYABLE`**; no category rows; cross-module facts stay in their governed destinations (Order Route / Stock) |
| 9 | Edit shows the seven-column table, View reverts to the old one | same | **one composition in both modes** |
| 10 | Category-Qty and Services summaries appear in Edit only | governed summaries | **shown in both applicable states** |
| 11 | Payment keeps the old capture-evidence and ledger compositions | PAYMENT ruling 2026-09-22 | **`Date · Payment received · Approval code · Collected by · Amount (RM)`**, shared table grammar with Items; **preserve the evidence facts — do not discard** |
| 12 | Totals are `TOTAL` · `PAID` · `OUTSTANDING` | same | **goods amount · service amount · `Total payable` · `Paid to date` · `Balance due`** (goods/service row words pending COPY review) |
| 13 | PDF prints `GOODS TOTAL 3` for one mattress + two services | same + Law D | **services never inflate physical quantity**; category breakdown |
| 14 | PDF still prints `TOTAL RECEIVED` | same — *"REMOVED from BOTH page and PDF"* | **remove; paid money totals once as `Paid to date`** |
| 15 | Existing customer carries no order count/link | Customer header ruling 2026-09-21 | **`· {n} orders ›`** (singular `· 1 order ›`) → Register searched by that phone. No new page, no new writer |
| 16 | `SO Doc Date` drawn as an input-like box | THE SO PAGE FIELD STANDARD 2026-09-22 | **grey box = editable, everywhere**, EXCEPT `SO Doc Date`, the payment rows and the computed totals, which are plain text |

**Type order (ruling):** card title 15px/600 blue → value 13px dark → label 12px grey.
**Voided payments** stay, struck, with the reason, never counted. **`Open this order in Payments →`** stays.

---

## 4 · THE FIVE KIT GAPS — re-verified against the REAL rulings

| Gap | Verdict now |
|---|---|
| 1 · Panel title is slate-12, the ruling wants `kit-blue-11` | **CORRECTED AFTER MEASURING — it was never the kit.** The SO page does not use kit `Panel`: it draws its cards with `Block`, exported from `SalesOrderWorkspace.tsx:813` and shared with `PurchaseOrdersPage`. `Block` gained an opt-in `titleTone="sales-order"`, so the blue is the Sales Order's and no other page moved. **And the component was never what decided the colour** — see §4.1. `Panel` is untouched. |
| 2 · No read-only/grey-box field display | **REAL, and now precisely defined** by the field standard. The page already has `Fact` (line 1032); it becomes the grey-box treatment and its three exceptions. Reuse it — no second component. |
| 3 · No persistent notice/callout in the kit | **REAL.** Confirmed absent. The page already draws four inline notices; they collapse into one kit component rather than a fifth copy. |
| 4 · `DataTable.totals` is one strip | **NOT a gap for this work.** The Payment totals are five rows in the page's own money zone, which finding 12 rebuilds; DataTable is not the instrument. |
| 5 · DataTable cannot shrink text columns | **Already solved** in the Items table built for the amendment; findings 8–9 extend it to View. No new table component. |

**Genuine kit extensions: NONE.** Gap 1 turned out to be a page-scoped stylesheet, not the kit
(§4.1). Gap 2 reuses the page's existing `Fact`. Gap 3 (a notice component) is real but no finding in
this scope needs it, and Jess ruled *"extend only what is necessary"* — it is left as a named debt.
Gaps 4 and 5 were not gaps. **Nothing in `components/kit/` changed in this work.**

### 4.1 · THE THING THE REVIEW COULD NOT SEE FROM THE SOURCE

Finding 2 was not a missing class. `<h2>` already carried `text-kit-blue-11` on `origin/main`. The
screen disagreed because **two page-scoped stylesheets repainted it with raw hex**:

| File | Rule | What it did |
|---|---|---|
| `purchase-orders/purchase-order-detail.css` | `:is(.po-detail-style, .so-detail-style, .mp-create-style) [data-block] > div:first-child` | `background-color: #b9c9d8` — the grey-blue band |
| same | `.so-detail-style … > h2` | `color: #ffffff; text-transform: uppercase` |
| `sales-order-detail-theme.css` | `[data-so-theme="trial"] .so-detail-style … > h2` | `color: #26384a` — won on specificity |

Measured in the shell walk before the fix: computed `color: rgb(38,56,74)`, `text-transform:
uppercase`, header background `rgb(185,201,216)`. **Changing the component alone would have shipped
nothing.** The Sales Order left the shared band rule; `.po-detail-style` and `.mp-create-style` keep
it, because Purchase Orders and Manual Purchase are a different module this work did not reopen.
A contract test now reads both stylesheets, and was proved red by putting the band back.

---

## 5 · WORDS — reconcile, do not re-ask

COPY-STANDARD § *Its section names* on `origin/main` already registers `SO info` · `Customer`
(+ `Emergency contact`, `Billing`) · `Delivery` · `Items` · `Payment`, and retires `Order info`,
`Goods`, `Money`, `Sales ownership`, `Delivery address`/`Delivery access` as headings. **The
approved names are reconciled from that table; no new owner approval is sought.** Any word this work
needs that is genuinely absent is a documentation gap and is registered with its ruling citation.

---

## 6 · DOCUMENT AND TEST DEBT

- **Superseded prose to remove** (preserving the newer rulings): the August "§ SALES ORDER OBJECT
  PAGE V2 · view mode presents facts" wording where it now contradicts the September field
  standard, and any surviving `Order info` / `Goods` / `Money` / `Sales ownership` prose.
- **Stale tests** that pin the old order, labels and subgroup placement —
  `SalesOrderWorkspace.ui-contract.test.ts` pins the card list, its order and every moved field, so
  it moves with the code and keeps asserting the RULE, not the markup. The amendment, document and
  agreement contracts stay untouched.
- The PDF contracts change with findings 13 and 14.

---

## 7 · WHAT THE REVIEW DID **NOT** COVER — not to be claimed

Verified on production: View · unsaved Edit · one mattress configuration · Before/After ·
reason-required · Revisions · History · the visible PDF. The temporary quantity change was
**discarded; nothing was saved or submitted.**

**Not verified:** full approval, other product configurations, gift controls, complete
historical-file behaviour.


---

## 8 · RESULT — each of the 16, verified or outstanding

**Branch `build/so-page-v2`, cut from `origin/main` `f79e97b70`.** Verified by three instruments:
`SOURCE` (a contract test that was proved red without its fix), `SHELL` (the real
`SalesOrderWorkspace` inside the real `OperationApp` shell, computed styles and DOM read in the
browser — `docs/evidence/so-page-v2/`), `PDF` (the generated document's own text layer).

| # | Finding | State | Evidence |
|---|---|---|---|
| 1 | Card order | ✅ VERIFIED | SHELL: `[data-block]` reads `SO info · Customer · Delivery · Items · Payment` |
| 2 | Blue sentence-case title, band retired | ✅ VERIFIED | SHELL: every card `color: rgb(13,116,206)` · `text-transform: none` · 15px/600 · header background transparent · 1px rule. SOURCE: §4.1 stylesheet contract |
| 3 | Dealer · Sales Location · Salesperson in `SO info` | ✅ VERIFIED | SHELL: those three labels are inside `SO info`; no `Sales ownership` heading anywhere |
| 4 | `SO Doc Date` · `Sales Location` · `Customer Requested Delivery Date` · `Proceed Date` | ✅ VERIFIED | SHELL: the four labels read exactly that |
| 5 | Billing under `Customer` | ✅ VERIFIED | SHELL: `Customer` sub-headings are `Emergency contact` · `Billing` |
| 6 | `Delivery` is ONE group | ✅ VERIFIED | SHELL: `Delivery` has zero sub-headings |
| 7 | floor → lift → items needing stair carry | ✅ VERIFIED | SHELL: label order `Floor (Max is 3rd Floor)` · `Lift available?` · `Items needing stair carry`, then the working line |
| 8 | The document's seven columns | ✅ VERIFIED | SHELL: `# · Item Code · Description · Qty · Unit (RM) · Disc (RM) · Amount (RM)` + `TOTAL PAYABLE`; no category rows |
| 9 | One composition in View and Edit | ✅ VERIFIED — **and it needed a second fix** | SHELL: same table both states. The walk then showed live `Configure` / `Remove` and typable boxes on a LOCKED order; the card is now inside the 0562 `fieldset` and the row writers are gated on `formLocked`. Contract proved red |
| 10 | Category-Qty and Services summaries in both states | ✅ VERIFIED | SHELL, View mode: `Qty: Mattress 2 · Pillow 1` / `Services: Delivery fee · Stair carry` |
| 11 | Payment table's five columns, evidence preserved | ✅ VERIFIED | SHELL: `Date · Payment received · Approval code · Collected by · Amount (RM)`; receipt number and `View slip` ride under the approval code; an absent slip now reads `Slip not recorded` rather than blank |
| 12 | Totals `Goods · Services · Total payable · Paid to date · Balance due` | ✅ VERIFIED | SHELL: `RM 3,780.00 · RM 350.00 · RM 4,130.00 · RM 2,999.50 · RM 1,130.50` |
| 13 | Services never inflate physical quantity | ✅ VERIFIED | PDF: two goods lines (2 + 1) and two services print `TOTAL PAYABLE 3`, not 5 |
| 14 | `TOTAL RECEIVED` removed from page AND PDF | ✅ VERIFIED | PDF text layer: `Goods · Tax · Total payable · Paid to date · BALANCE DUE`, no `TOTAL RECEIVED`. SHELL: absent from the page body |
| 15 | `· {n} orders ›` on an existing customer | ✅ VERIFIED | SHELL: chip reads `Existing customer · 4 orders ›` → `/operation/orders?search=…`; the Register seeds its search from that parameter |
| 16 | `SO Doc Date` is plain text, not a grey box | ✅ VERIFIED | SHELL: computed background `rgba(0,0,0,0)`, border width `0px`, while every editable field beside it keeps its box |

**Outstanding: none of the 16.**

### What this PR did NOT do, and is not claiming

- **No kit component changed.** The notice component (gap 3) stays a named debt.
- **Purchase Orders and Manual Purchase did not move.** They keep the band by explicit contract.
- The walk ran against the committed dev harness (`so-workspace-shell-preview`) with a fixture, not
  against a production order. **Authenticated production acceptance is the owner's**
  (`project_authenticated_acceptance_is_owner_only`).
- The Amendment safeguards in §2 were preserved, not re-verified end to end by this work; their own
  suites (`amendment-lane-0564`, `issued-document-retention`, the rebuilt-PDF contracts) still pass.


---

## 9 · PRODUCTION VERIFICATION — signed in, read-only, 2026-09-23

**Deployed SHA `87a83b729`** (PR #1541 merged 10:12:51Z; deploy run `35847487030`;
`__carres_deploy.json` → `builtAt 2026-09-23T10:24:06.621Z`).
**Order walked: SO-1365** at `/operation/orders/so/ecef2b53-…` — the same order the review reported.

**Local verification (§8) and production verification (this section) are separate.** §8 proves the
build; this proves the deploy. Nothing below was inferred from a bundle string or a source read.

### The BEFORE, measured on production `598ba5b58` minutes earlier

| | Measured |
|---|---|
| Cards | `Customer · Order info · Delivery · Goods · Money` |
| First card title | `color: rgb(38,56,74)` · `text-transform: uppercase` · header background `rgb(185,201,216)` |

That is findings 1–6 and the band, observed live, on the deployed build the review complained about.

### The AFTER, measured on production `87a83b729`

| # | Measured on the deployed page / document |
|---|---|
| 1 | `[data-block]` → `SO info · Customer · Delivery · Items · Payment` |
| 2 | all five titles `color: rgb(13,116,206)` · `text-transform: none` · `15px` / `600` · header background `rgba(0,0,0,0)` · `border-bottom 1px` |
| 3 | `SO info` carries `Dealer` · `Sales Location` · `Salesperson`; no `Sales ownership` heading on the page |
| 4 | `SO info` labels read `SO Doc Date` · `Customer Requested Delivery Date` · `Proceed Date` |
| 5 | `Billing` is inside `Customer` (with `Emergency contact`) and absent from `Delivery` |
| 6 | `Delivery` has zero in-card headings |
| 7 | `Delivery` label order: … `Floor (Max is 3rd Floor)` · `Lift available?` · `Items needing stair carry` |
| 8 | Items `thead` → `# · Item Code · Description · Qty · Unit (RM) · Disc (RM) · Amount (RM)`, closing `TOTAL PAYABLE RM 1,529.00`, no category rows |
| 9 | **View:** the `Items` card sits in a `fieldset` reporting `disabled: true`, and the table renders **zero** buttons. **Edit:** the same seven columns, the fieldsets report `disabled: false`, and `Configure` / `Remove` return. `Cancel` restores the locked state with no dirty banner |
| 10 | `Qty: Mattress 1` and `Services: Dispose old sofa … · Dispose old mattress` print in View |
| 11 | ledger `thead` → `Date · Payment received · Approval code · Collected by · Amount (RM)`; the row prints `Receipt RC-230926-3537 · View slip` under the approval code |
| 12 | totals → `Goods RM 1,399.00 · Services RM 130.00 · Total payable RM 1,529.00 · Paid to date RM 765.00 · Balance due RM 764.00` |
| 13 | **the generated document**: one mattress at qty 1 plus TWO services prints `TOTAL PAYABLE  1` in the QTY column — services no longer inflate the physical count |
| 14 | `TOTAL RECEIVED` absent from the page body AND from the document; the document's totals read `Goods · Services · Tax · Total payable · Paid to date · BALANCE DUE` |
| 15 | chip reads `Existing customer · 1 order ›` (correct singular) → the Register opens with its search box seeded from `?search=` and returns exactly 1 row |
| 16 | `SO Doc Date` computes `background rgba(0,0,0,0)` / `border 0px`; an editable field beside it computes `background rgb(255,255,255)` / `border 1px` |

**Preserved, measured:** the four object tabs `Order · Revisions · History · Order Route` are all
present. The **Purchase Orders object** on the same deploy still reads `color: rgb(38,56,74)` ·
`uppercase` · header background `rgb(185,201,216)` — Purchasing did not move.

**No customer transaction was altered.** `Edit` was entered and `Cancel` pressed on SO-1365 with no
field touched; the page returned to the locked state with no unsaved-change banner. No write request
was issued at any point in this verification.

**Outstanding from the 16: none.**

### Known, and NOT caused by this work

🟡 `/api/operation/dashboard` still returns an error on production — the Operation dashboard renders
*"Couldn't load dashboard"*. This is the pre-existing `awaiting_operation_action` defect (retired by
0167, reintroduced by 0519), already raised with its owner. It is unrelated to the Sales Order page
and was failing before this deploy.

---

## 10 · AMENDMENT EVIDENCE — reconciled, and the gaps closed, 2026-09-23

The 16 page/PDF corrections in §§8–9 are **closed and not reopened**. This section covers the other
half of the agreed Sales Order scope: the Amendment behaviour.

### 10.1 · What already existed, read area by area

| Area | Existing evidence |
|---|---|
| Save / Submit routing | `sales-order-change.test.ts` (classifier) · `orders.changes.test.ts` (the server chooses, 11 cases) · `sales-order-classification.ts` Class A/B sets |
| Customer agreement | `amendment-agreement.test.ts` (7 route cases) · `amendment-lane-0564` (kinds, pointer required, must name a revision of THIS order, evidence against different terms) · `SalesOrderAmendment.test.tsx` (7 gate cases) |
| Approval / rejection | `amendment-lane-0564` (approve applies the WHOLE change as one revision; approve refused with no agreement; reject needs none; withdraw) · `orders.changes.test.ts` (the stair fee re-stamps on approve, not on reject) · `SalesOrderAmendment.test.tsx` (Principal decides, Operation routes) |
| Version conflicts | `amendment-lane-0564` (a header value that MOVED makes it stale) · `sales-order-contractual-hash.test.ts` (the SQL hash covers exactly Class A, and no Class B field) · `SalesOrderAmendment.test.tsx` (the UI refuses a stale approval) |
| Exact-version PDF | `issued-document-retention.test.ts` (6) · `orders.revision-document.test.ts` (7 route cases) · `amendment-lane-0564` (record once, wrong path refused, legacy NULL) · `sales-order-template.rebuilt.test.tsx` (12) |

**This evidence was never actually executed.** The integration suites are `describe.skipIf` on
`CARRES_TEST_DATABASE_URL` and had only ever been reported as SKIPPED. Run for real against a
throwaway Postgres carrying the whole migration chain, **all 13 original cases pass.**

### 10.2 · The four rules nothing asserted — now closed

| Gap | Why it mattered | Closed by |
|---|---|---|
| **A rejection's whole content is that nothing happened** — the existing case proved only that the call is *allowed* without an agreement | A refusal that quietly wrote half the proposal would have passed every case in the file | `amendment-lane-0564` — the order row, every goods line, every service and `max(revision)` are compared before and after; the refusal's `decided_by` and `decision_note` are asserted |
| **A correction beside an open request must NOT kill it** — only the *stale* direction was tested | A staleness rule that widened to "any edit" would pass the whole suite while, in the shop, one typo fix silently killed a change the customer had already agreed to | `amendment-lane-0564` — a `customer_email` correction saves, the agreed request still approves; the control in the same case moves a value the proposal *was* computed from and must be refused `amendment_stale` |
| **The instalment plan is a Class A signed term** and had no routing case | Every other Class A route had one; a plan change could have started saving straight through with nothing going red | `sales-order-change.test.ts` — both directions (cash → plan, plan → cash) must be `Submit amendment request` |
| **Printing a kept version** | The pane showing the stored file proves nothing about the button the office presses; `Print this version` could still have rebuilt the sheet and handed the customer a document that was never issued | `SalesOrderWorkspace.ui-contract.test.ts` — the stored URL is opened and returns before any render path is reached |

**Each was proved RED before being kept**: the print branch removed, `installmentChanged` dropped
from the commercial test, and a rejection made to write one field — each turned its new case red, and
green again on restore.

### 10.3 · NO APPLICATION DEFECT WAS FOUND

All five areas behave as ruled. **No product code was changed by this reconciliation** — the work is
evidence only. One red result during the work was traced to contaminated shared fixture state in the
integration file (the cases run in one transaction and the earlier approval had already moved the
order), **not** to a product defect; the new case now reads the order's live base rather than
assuming the fixture's.

### 10.4 · EXPLICIT LIMITATIONS

1. **The integration cases are local-only.** `describe.skipIf(!URL || !LOCAL)` means CI reports them
   SKIPPED, not passed. They were executed here against a throwaway cluster; reproduce with:
   ```
   LC_ALL=C node scripts/dry-run-migrations.mjs --baseline scripts/migration-replay-baseline.json --keep
   CARRES_TEST_DATABASE_URL=postgres://postgres@localhost:<port>/<db> \
     npx vitest run src/test/amendment-lane-0564.integration.test.ts
   ```
   Changing that gate is a CI decision, not this scope.
2. **Protected ownership routes differently from the MASTER sentence.** The 2026-09-22 ruling lists
   `Sales Location · Salesperson · Dealer` among the changes that `Submit amendment request` covers.
   In code they are deliberately excluded from `classifySalesOrderChange` and keep their own governed
   approval lane (0329) — the save door *refuses* them and `attribution-lane.test.ts` covers submit /
   approve / apply / withdraw / permissions. **The capability exists and is governed; only the lane
   differs.** Folding the two lanes together is a design change, not a missing check, and is not done
   here.
3. **Migration replay is not clean on `main`.** 564 of 570 files replay; six fail, five on the known
   baseline and one — `0561_the_voucher_line_guard_survives_a_rebuild.sql`, a syntax error — not on
   it. Unrelated to Sales Orders, and left with its owner.
4. **Three Finance integration suites fail on `main`** against the same test database
   (`finance-approver-role`, `advances-to-suppliers-1230`, `money-moves`). Unrelated to Sales Orders
   and left with their owner.
5. **Not covered anywhere, and not claimed:** a real customer order was never amended, approved or
   rejected to demonstrate any of this. Every transaction-changing scenario ran on the throwaway
   database, inside one rolled-back transaction.

---

## 11 · SCOPE CLOSED, 2026-09-23 — and where the two open items now live

The delivered Sales Order page and Amendment scope is **closed**. Nothing in §§1–10 is reopened, and
no check recorded there is repeated.

| Delivered | SHA | Record |
|---|---|---|
| 16 page/PDF corrections | `87a83b729` | §8 local · §9 production, signed in |
| Amendment evidence reconciled, four unasserted rules closed | `0ac659425` | §10 |

Both deploys converged on all three governed surfaces (`erp` · `pos` · the production Worker).

**The two items this scope does NOT close are now owned elsewhere, not by this file:**

1. **Protected ownership still uses the separate approval route.** Recorded in
   `docs/orders/MASTER.md` § *VIEW FIRST, EDIT ON PURPOSE* → **PROTECTED OWNERSHIP IS NOT YET IN THIS
   LANE**. The 2026-09-22 ruling is unchanged and remains the approved target; the entry states the
   measured difference and names what folding 0329 into the amendment lane would take. **It needs an
   owner decision before it is built** — it is a design change, not a missing check, and this
   evidence scope had no authority to make it.
2. **The integration evidence is skipped by CI.** Recorded as
   `so-amendment-integration-tests-skip-in-ci` in `docs/carry-forwards.md`, with the exact reproduce
   command, the CI shape that would turn the existing `skipIf` off without editing a test, and the
   two unrelated reds that come with it. **Locally executed and PASSED on 2026-09-23; SKIPPED on every
   pull request.** Both statements stay together wherever this is quoted.

**Unrelated, and staying with their existing owners:** `/api/operation/dashboard` returning an error
on production · `0561_the_voucher_line_guard_survives_a_rebuild.sql` failing migration replay while
absent from the baseline · three Finance integration suites red on `main`.
