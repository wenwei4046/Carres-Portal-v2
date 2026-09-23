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
