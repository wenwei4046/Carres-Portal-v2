# ORDERS — MASTER

> ## ORDERS V1 — historical implementation evidence
>
> **Orders V1 is historical implementation evidence. It is not the architectural template.**
> It is the only place in the business where the whole customer journey was built end to end,
> and its measured record is the evidence base for
> [`../ERP-ARCHITECTURE.md`](../ERP-ARCHITECTURE.md).
>
> **Each responsibility evolves independently. A redesign changes only the responsibility being
> redesigned.** D1 and D2 were fixed in place as production-critical defects;
> **D3 · D4 · D5 · D8 · D9 were not.**
>
> **Every one of those five is a question about where a responsibility belongs, not a bug**, and
> the architecture is where that is answered. **Some of them will disappear because the
> responsibility moves to another module.** §12 keeps them for that decision, not for a fix.
>
> **The only Orders document.** Overwritten when something is re-ruled; never versioned.
> **You read `CLAUDE.md` and this file.** Open `COPY-STANDARD.md` for a word,
> `ACTION-FLOW-STANDARD.md` for the engine law, `01/02/03-*.md` for a token, `ENGINEERING.md`
> for mechanics. **Do not read them to start work.**

| I am working on | Read |
|---|---|
| anything | **§1 · §2 — short, and they bind everything** |
| the Orders list | **§3** |
| the order drawer | **§4** |
| goods on an order | **§5** |
| a delay | **§6** |
| delivery on an order | **§7** *(the Delivery PAGE is [`../delivery/MASTER.md`](../delivery/MASTER.md))* |
| money on an order | **§8** *(the collections desk is [`../payment/MASTER.md`](../payment/MASTER.md))* |
| documents and evidence | **§9** |
| something decided and not built | **§11 Approved Evolution** |

---

# §0 · THE CHARTER — FROZEN 2026-08-08 (Loo). Phase 1 of the Golden Template.

> **Sales Order is the truth/register home of the customer order: find any order and understand
> the whole transaction — while EXECUTION and Work stay with the module that owns them.**

**IT IS A REGISTER, NOT A WORK QUEUE.** When a customer phones, an authorised operator must be
able to find the transaction and see its current truths. Prioritised work belongs to Work and
the owning execution module; it may link back to the SO but may not turn the register into a
second queue.

```
1  Which customer transaction is this?
2  What is true about it and what documents/facts follow from it?
```

**ONE REGISTER, ONE PURPOSE:**
```
DATE SCOPE   `All` = every non-cancelled order, never a month window
OWNER SCOPE  an authorised operator may find every order; owner may remain a filter
= filters narrow truth; they do not redefine the page as My Work.
```

### WHAT SALES ORDER OWNS
```
✓ the customer order's identity          ✓ the customer
✓ WHAT WAS ORDERED (order_lines)         ✓ the customer's promise / required date
✓ PIC / ownership                        ✓ the order's history
✓ cross-module fact visibility           ✓ document and fulfilment lineage
```

### WHAT IT DOES NOT OWN — it may only READ · SUMMARISE · LINK
```
✗ issuing or managing a purchase order    ✗ receiving goods / GRN
✗ supplier claim settlement               ✗ delivery planning execution
✗ payment collection accounting           ✗ service-case execution
```

> ### ⚠️ AND THE NEXT ACTION IS A SUMMARY, NOT A POSSESSION (corrected on the draft, 2026-08-08)
> The draft listed *"overall operational next action"* under OWNS. **It is not Orders'.**
> `Issue PO` is Purchasing's act, `Call {logistics} — confirm delivery date` is Delivery's,
> `Collect RM {amount}` is Payment's — and §1 already rules *"the same action is never defined
> in two files"*, with `packages/shared/order-actions.ts` SHARED and the Delivery page rendering
> the same computation. **Orders owns WHICH ACTION LEADS on the row. It does not own the
> action.** Left under OWNS, this is the first door through which action logic walks back into
> Orders — the exact failure this Charter exists to close.
>
> **Same distinction on the items:** Orders owns *what the customer ORDERED*. It does not own
> their STATE — stock is Stock's, received is Receiving's, bought is Purchasing's.

**THE BOUNDARY, drawn once:**
```
Customer Order → SALES ORDER (operational home)
                   ├── Purchasing  "what is happening?"
                   ├── Receiving   "what was received?"
                   ├── Delivery    "what is booked?"
                   ├── Payment     "what is still owed?"
                   └── Service     "what issue is open?"
Sales Order is the CUSTOMER-ORDER VIEW of the truth. Each module keeps its own truth.
```
This is `../ERP-ARCHITECTURE.md` Law B applied — *a summary is READ-ONLY, forever; it may
never gain a form.*

### ⭐ AND THE RULING THAT GOVERNS THE WHOLE REBUILD
```
The old OperationOrdersControl's business logic is EVIDENCE, not a UI SPECIFICATION.

    keep what it KNOWS   ≠   keep how it DRAWS
```
**Every element of the old page — `Journey · Health · Calls · Current Issues · Tabs · Queue ·
Calendar · Team` — is re-asked: does Sales Order need this fact, and if so where does it live?
Nothing survives merely because it is already there.**

---

# §0.1 · SALES ORDER UI / OBJECT CLOSEOUT — OWNER RULING 2026-08-13

This section is the approved target and overwrites any older UI wording that conflicts with it.
The measured implementation record below remains evidence of what is built, not permission to
keep a superseded target.

## Register

- The default business columns are exactly, in order:
  `SO No | Ordered | Customer Delivery | Customer | Delivery Location | PO No | DO No`.
  The small `▸` is UI chrome, not a business column. There is no invented overall `Current` or
  combined status column.
- The page has a compact destination header/work toolbar, then a breathing gap, then one light,
  clearly bordered Register. It is neither a borderless continuous slab nor a giant dashboard
  card. KPI cards do not precede it.
- Default widths are governed and usable without staff resizing. Optional columns may widen the
  sheet and create horizontal scroll; default columns are never squeezed unnaturally to make an
  added column fit.
- `▸` expands goods only as one clean read-only mini-table beneath the parent row. Its locked
  columns are `Category | Unit ID | SKU | Qty | Item | Deliver To`. `Item` consolidates the
  product/configuration facts Operations uses to identify the exact goods; it does not create
  one column per product attribute. Unit ID reads Stock's per-unit register. Deliver To reads
  Purchasing's PO/PO-line result (including quantity splits). Sales Orders stores neither fact.
  Warehouse physical location is deliberately absent and must never be substituted for Deliver To.
  A physical goods line with no allocated Stock Unit says `Not allocated`; a Service says
  `Not applicable` rather than pretending a Unit should exist.
- A consolidated PO does not by itself prove a PO-line-to-SO-line allocation. Where the existing
  Purchasing relationship cannot identify that allocation structurally, the Register must keep
  the governed default/readable fallback and must not distribute another Sales Order's quantity
  or destination by inference. A future allocation key may close this; this UI slice does not.
- Search, typed filters, sort, Columns and Export remain useful register capabilities. Selection
  may scope Export; it does not license workflow bulk actions on a truth register.
- Document numbers navigate directly to their authoritative object where the relationship exists:
  SO → SO, PO → PO, DO → DO.
- The approved row interaction is a 2990-style right-click context menu. Preserve useful document
  capabilities. `Edit` is the explicit action that leaves the Register for the formal edit
  context; View/Preview/Print do not edit. Do not add `Issue PO`, `Issue DO` or other operational
  acts whose owner is Purchasing, Delivery, Money, Stock, Receiving, Claims or Work.

## Detail, edit, amendment and document truth

- Sales Portal/POS is the authoritative source for Sales Order form fields and commercial truth.
  The backend detail/edit context reuses that complete contract; it does not invent a second,
  simplified commercial form because 2990 has one.
- Operation may directly correct safe contact and operational facts. A harmless contact correction
  is not the same as a destination or other change that alters a customer commitment.
- Sales owns customer/commercial amendments. Operation may submit/route a customer change request.
  Management may approve/reject or directly amend when authorised. Every applied change carries a
  structured reason, Before/After, actor and time.
- The same customer transaction keeps the same SO number. Cancel only when that transaction is
  cancelled. A placed PO does not force cancel/reorder; it changes a simple edit into a governed
  Amendment with explicit downstream impact handling. `Staff correction`, `Customer change` and
  `Fulfilment replacement` are different causes and may not be collapsed.
- Rev 1 is permanently the original SO. A pending or rejected amendment is not a Revision. Every
  approved, applied amendment creates Rev 2/3/4… and preserves the complete historical version and
  its PDF/document truth. **Revisions are complete versions; History is an event ledger. They are
  separate views and concepts.**
- Amendment impact is computed before approval across supplier/PO commitments, Unit/warehouse
  allocation, Receiving, payment/commercial difference, delivery commitment, Work, permissions and
  audit. Existing downstream documents and facts are never silently rewritten. Concurrent/stale
  proposals must fail safely and be re-evaluated against the current Revision; rollback is a new
  governed change, never deletion or in-place history editing.
- Detail supports `Current`/`Order` truth, `Revisions`, `History`, actual PDF/document access and
  `Order Route`. `Current` here means the complete current SO version, not an overall lifecycle
  status.

## Order Route

`Order Route` is a read-only route map/checklist derived only from authoritative facts. It is not a
manual checklist and not another overall status. Its primary presentation is one readable route per
actual goods/category/item scope, rendering only applicable facts along `SO → PO → ETA → GRN → Unit
→ DO → Delivered` and marking the present fact `CURRENT`. Split fulfilment may show simultaneous
positions — for example, a Bed delivered while a Sofa remains at supplier — so there is no forced
single “You are here”. Document identifiers link to their owning objects. Missing facts are stated
truthfully (`PO not issued`, `Waiting Purchasing`) rather than filled with invented stages. A compact
secondary `Still owed` checklist shows only meaningful Goods, Delivery, Money, Loan and Other
Commitments obligations; it does not render a dashboard card for every clear/empty state. Sales
Order does not gain a writer.

## Owner UI acceptance corrections — 2026-08-14

- The Sales Order object uses the shared Object Header: `← Sales Orders`, `SO-number · Customer`,
  governed actions, then `Order · Revisions · History · Order Route`. The identity and navigation
  persist in View and Edit; `Order Route` is the fourth view of the same object.
- The one Settings Workspace remains the sole Settings home. Sales Order Settings uses readable
  `Order Entry` and `Payment Methods` summaries, then focused per-item Edit with Save/Cancel inside
  editing context. It preserves the verified config writer, validation and permissions.
- Payment config `followUps` are checkout questions/required information, not Work/Human Follow-up;
  user-facing Settings copy must call them `required information` (or the exact field label), never
  `Follow-up`.
- These are owner UI acceptance corrections to the existing production slice, not new business
  rules. **CLOSED / PRODUCTION-VERIFIED 2026-08-14:** PR #771 merged as `5fed50d3`; PR #773 fixed
  the known-goods category fallback and merged as `4934826d`; PR #776 closed the final
  object-route/Settings presentation mismatches and merged as `30fa407b`. Deploy run `31768870907`
  converged all governed production surfaces on exact SHA `30fa407b`; the authenticated acceptance
  list passed at 1440×900. `docs/ui/MASTER.md` §6.6 records the reusable Shell/Register/Object proof.
- **FINAL OWNER VISUAL ACCEPTANCE — CLOSED / PRODUCTION-VERIFIED 2026-08-14.** PR #787 merged as
  `b7d68eed`; its production acceptance exposed only the Edit notice occupying a document column.
  PR #788 corrected that composition and merged as `ebc8fb5d`; deploy run `31790978222` proved the
  exact final SHA. Authenticated checks covered the Register and approved goods expansion, Object
  View/Edit/Revisions/History/Order Route, and coexistence with My Work open. Proceed date uses the
  pre-existing Operations writer; Customer Delivery remains read-only and Delivery's Confirmed
  Delivery Date remains distinct. No new address, access, delivery-date or destination field was
  created. `docs/ui/MASTER.md` §6.6 records the final reusable UI proof.

## Object/domain completeness sweep — 2026-08-13

Evidence inspected: current Carres register/workspace/API/schema and migration surface; live 2990
Sales Orders register and SO detail; the Carres architecture, UI/copy/action/PDF authorities. 2990
is evidence only. AutoCount-style grid power already exists in Carres; Linear-style slab layout and
Shopify-style transaction/version discipline add no unresolved business rule.

| CAPABILITY | CARRES CURRENT / OWNER | 2990 / REFERENCE EVIDENCE | VERDICT | DEPENDENCY / GAP |
|---|---|---|---|---|
| Register normal + selected | Built DataGrid; Orders owns truth; selection scopes Export | 2990 has checkbox rows, dense grid and totals | **ADAPT** | Replace default target with ruled seven columns and bounded surface; keep selected state non-operational |
| Search/filter/sort/Columns/export | Built server search, typed column filters, chooser, XLSX, resize/reorder/layout memory | 2990 exposes search, per-column filters, 42-column chooser and Excel | **KEEP / ADAPT** | Govern widths/default order; optional columns may overflow; remove `Current` as a candidate overall pointer if it implies status |
| Inline goods expansion | Built one line-item disclosure | 2990 expands nested goods | **ADAPT** | Locked six-column read-only mini-table; Unit ID from Stock, Deliver To from Purchasing; no nested register controls or cross-module status |
| Context actions + bulk | Built right-click `Open · Edit · Print PDF · Copy SO No`; bulk Export only | 2990 proves right-click document action pattern | **KEEP / ADAPT** | Rename/open semantics to explicit View/Preview where needed; add no execution acts; preserve selection only for truthful export |
| View / Preview | Built workspace presents saved truth and the actual PDF; explicit Edit changes context | 2990 detail is read-only until Edit | **KEEP / ADAPT** | PR #754 production-verified 2026-08-13; direct SO/PO/DO lineage completeness remains in the later dependency scopes |
| Edit / field contract | Built UI and API restrict Edit to safe customer/contact/address/access/proceed-date corrections; items and promised delivery remain read-only | 2990 has a comprehensive backend form | **KEEP / IMPROVE** | PR #754 production-verified 2026-08-13; authoritative Sales Portal/POS parity and the complete role matrix continue through Amendment/Approval |
| Amendment request + approval | Request/apply foundations and stale detection exist; current UI places amendment beside items | 2990 has separate Amendments and amend fields | **ADAPT / BUILD** | Sales ownership, operation routing, management approve/reject/direct amend, structured Before/After/reason; impact preview across all owners |
| Revisions | Revision snapshots and historical rendering/PDF exist; current UI combines `History / Revision`; Rev 1 may be minted only on first save | 2990 exposes Revisions and current document identity | **ADAPT / BUILD** | Backstop original Rev 1 at transaction birth; only approved applied amendment mints next Rev; separate complete-version view |
| History / audit | Order history and revision events render together; actor/cause coverage is partial | 2990 has History | **ADAPT / BUILD** | Separate append-only event view; actor/time/reason/Before/After and permission decisions |
| Actual PDF + Print | One live renderer and historical snapshot rendering exist; Print opens same blob | 2990 has Print PDF | **KEEP / ADAPT** | Archive/address stable current + per-Revision document truth; follow `SO-PDF-STANDARD.md` |
| Copy to new SO | Built as a governed seed of the authoritative create form; the register keeps `Copy SO No` as a separate clipboard act | Mature document systems copy into a new draft/transaction, never duplicate identity | **KEEP** | PR #764 production-verified 2026-08-13 (SO-1303 → SO-1320 · Rev 1); money, promised/proceed dates, history, payments and PO/DO/unit links are excluded by construction |
| Cancel SO | Built as the ONE governed door — register + Workspace both reach the single existing writer; migration 0350 adds the owner-impact read, the required reason and the pre-write impact stamp | 2990 detail exposes Cancel SO | **KEEP** | Production-verified 2026-08-14 (SO-1320 cancelled, SO-1313 refused). Place-only fails safe; the proceeded-cancel approval lane stays Card 7's deferred item |
| Scan / import | Not built. The AutoCount CSV importer stays on frozen Old Orders and is NOT the answer here — different act, different source, and it retires at go-live (CLAUDE.md §6) | 2990's `ScanOrderModal` + `scan-so.ts` prove the source exactly: a photo/PDF of the **handwritten showroom sale-order slip** | **BUILD — own card** | Source and write boundary now settled (§11 · Sales Order Intake). Depends on Sales Order Settings (the extractor matches ACTIVE option lists) and on a vision credential only the owner can set |
| Settings / Maintenance | Built as `Sales Order Settings`, a section of the one Settings Workspace reached from the Page Header gear; `SO Maintenance` retired | 2990 exposes SO Maintenance and global Settings | **KEEP** | Owns Order Entry fields, payment methods and the option lists Sales Orders actually controls. Another module's master data is named and linked, never edited here; a source guard holds "never an edit door into historical Sales Orders" |
| Permissions | RLS/API roles exist; direct-edit/amendment/cancel matrix is incomplete | 2990 Super Admin surface does not prove Carres roles | **BUILD** | Explicit view, safe-correct, request, approve/reject, direct-amend, cancel, PDF/export permissions; enforce server-side |
| Numbering + lineage | SO identity, DO fields and PO relations exist; register lacks ruled PO/DO lineage columns | 2990 shows Current SO and related document modules | **ADAPT / BUILD** | Same SO across revisions; direct SO/PO/DO links; define multi-PO/multi-DO compact cell + overflow interaction without inventing one Current |
| Order Route | Built as the governed read-only fact-derived map with durable entry and owner links | 2990 Relationship Map is evidence for lineage, not specification | **KEEP** | PR #762 production-verified 2026-08-13; Orders remains a reader and gains no cross-module writer or overall status |
| PO / supplier consequences | Purchasing owns issue/cancel and promises; SO amendment foundations do not yet resolve every commitment | 2990 co-locates procurement modules but ownership differs | **RELOCATE / BUILD** | Impact rows link to PO/supplier owner; no silent PO rewrite |
| Unit / warehouse + Receiving | Unit allocation truth is built; Receiving owns receipt ledger | Mature ERP keeps serial/unit and receipt history immutable | **KEEP / BUILD** | Amendment impact must preserve/release/reallocate through governed owners; received facts are never rewritten |
| Delivery | Delivery owns carrier/trip/DO/proof; booking promise remains with order | 2990 shows read-only DO status and Delivery Planning | **KEEP / ADAPT** | Route and amendment show consequences/link; Delivery remains writer; split DO/positions supported |
| Money / Loan / other commitments | Payment and loan surfaces own their obligations; unified current truth is not complete | 2990 detail shows payments/balance | **KEEP / BUILD** | Amendment computes price/payment/refund/loan delta; no silent financial rewrite; surface other open commitments |
| Claims / Issue Tracker / Work | Claims and Work are separate owners; old Orders page contains duplicated journey/work signals | Reference suites route exceptions to owner queues | **RELOCATE / BUILD** | Route shows linked facts; amendment/cancel raises owner work; register never becomes queue |
| Concurrency / rollback | Amendment stale detection exists; revision writes lock rows; end-to-end policy incomplete | Mature versioned documents use optimistic concurrency and compensating revisions | **ADAPT / BUILD** | Revision token/hash on edit/apply; stale conflict UX; rollback by new approved Revision, never delete |
| Reporting / export | Register XLSX exists | 2990 exports Excel and KPI totals | **KEEP / ADAPT** | Export selected/filtered truth with stable column semantics; cross-module operational reports belong to Reports/owners, not SO KPI cards |

**Genuine owner decisions:** none remain in this sweep. The owner has already settled register
purpose, amendment ownership, revision identity, cancellation meaning and Order Route semantics.
Open items are dependency and implementation decisions, so engineering proceeds without inventing
official Card numbers.

## Ready implementation slices — unnumbered

1. **CLOSED / PRODUCTION-VERIFIED 2026-08-13 — Sales Orders Register + Document Actions** — PR
   #751 merged as `60ba6324`; no schema migration or new writer. Web bundle
   `index-C7_GK70Y.js` was deployed to both governed Pages projects (`carres-portal` `fdbb7496`;
   `carres-pos` `db39d1c6`) and all four canonicals converged on that exact asset. Production Worker
   version `5c669747-8a6b-4998-9643-fcc39604c69d` serves the API change at 100%. Authenticated
   production verification on `erp.carresofficial.com/operation/orders` proved the exact default
   order **SO No / Ordered / Customer Delivery / Customer / Delivery Location / PO No / DO No**,
   bounded bordered surface, preserved Search / typed filters / Columns / Export,
   inline goods-only grouped disclosure (SKU/model/size/quantity), direct SO document
   navigation, and the 2990-style right-click actions **View / Edit / Preview PDF / Print PDF / Copy
   SO No**. No overall Current/status or Register work-queue behavior is present. Type checks, design
   guards and the 82-test Orders API suite passed before merge. The 2026-08-14 owner touch-up in
   PR #771 removed the permanent Columns count and made the utility compact; PR #773 maps known
   legacy goods to their real category before fallback. Authenticated production proof on SO-1319
   rendered `B1201S-K` under `MATTRESS`, not `OTHER GOODS`.
2. **CLOSED / PRODUCTION-VERIFIED 2026-08-13 — Sales Order Detail + Authoritative Edit Contract** —
   PR #754 merged to `main` as `3bdc7ada`. Authenticated production verification on SO-1318 proved
   the saved Current/Order truth, explicit Edit context, one-page current PDF with no render error
   and the enabled Print PDF control. A safe phone correction saved as immutable Rev 5; restoring
   the fixture's original value saved as immutable Rev 6. Items and promised delivery stayed
   read-only in Edit. The first forged promised-date API probe exposed a stale Worker, so main was
   deployed as Worker version `53442e20-7024-4b69-81bf-f1ba68b06bbd`; the repeated authenticated
   probe then failed at the API boundary with 422 `invalid_param` before the revision RPC. The
   `/health` check returned 200 `{"ok":true}`. The complete 2,186-test API suite and API typecheck
   passed at the merged source before deployment. No Register or settled business decision changed.
3. **CLOSED / PRODUCTION-VERIFIED 2026-08-13 — Amendment / Approval / Revision / History** —
   PR #756 merged the routed proposal, read-only owner impact, principal approve/reject, stale
   refusal, atomic apply, complete immutable versions, separate event History, historical PDFs and
   rollback-as-new-proposal; PR #758 closed the strict CI finding. Migration 0348 was applied and
   its RPCs/constraint/audit column probed. Production verification on SO-1318 submitted a proposal
   from Rev 6, computed impact across every owner, rejected it under an active principal identity,
   preserved Rev 6 and showed both the submission and rejection in History. The live PO schema
   exposed its `so` linkage during that probe; the function was corrected in production and the
   immutable repo correction is migration 0349 (PR #761). Exact main `f17f85ff` converged on both
   Pages projects, both custom domains and Worker version `5bca7fff-693a-40db-8396-ccf43fc38e6e`.
4. **CLOSED / PRODUCTION-VERIFIED 2026-08-13 — Order Route** — exact source commit `519a3fa2`
   passed the 7,250-test repository gate and PR #762 CI, then merged without alteration as parent of
   `55642ea4`. Automatic deployment run #710 converged that exact merged-main SHA across both
   governed Pages projects (`carres-portal` deployment `1f3cd3a7`; `carres-pos` deployment
   `38d66340`), both canonical domains and Worker version
   `95d15d76-5517-4f02-a52e-bb46b7d17553`. Authenticated production verification on SO-1318
   proved the durable `?route=1` entry survives reload; live document/Revision lineage; the
   goods-position read; all five **Goods / Delivery / Money / Loan / Other
   Commitments** lanes; and real owner handoffs, including the selected-order Delivery link. It is
   fact-derived and read-only: no manual checklist, giant overall status or foreign writer was
   introduced.
5. **CLOSED / PRODUCTION-VERIFIED 2026-08-13 — Copy to new Sales Order** — exact source commit
   `f6a51d59` passed PR #764 CI, then merged without alteration as parent of `6c43c5c6`. The
   `Deploy production` run repeated the authoritative gate (`ci:migrations` · lint · typecheck ·
   the 7,250-test suite · build) on that exact merged SHA, deployed both governed Pages projects
   and the production Worker (Version ID `53b74bc3-7cdd-42fc-a220-c162a157a0b8`), and
   `verify-production.mjs` proved all five canonical surfaces — both Pages projects, both custom
   domains and the API Worker — report `6c43c5c6`. No schema migration and no new writer: copy
   seeds the existing authoritative create form, which already owns the birth door.
   Authenticated production verification on `erp.carresofficial.com` opened the register row
   context menu on **SO-1303** and used `Copy to new Sales Order`. The draft opened as
   `New Sales Order` carrying the badge `Copied from SO-1303 · review before creating`, with
   customer, contact, address, dealer/showroom/salesperson and the goods lines (RM 2,499) copied.
   **The copy boundary held on every excluded fact:** the source's `paid` RM 1,250 rendered as
   `Paid RM 0`, and its fixed `2026-08-30` promised delivery and `2026-08-09` proceed date both
   rendered empty — a copy inherits goods and counterparty, never money, never a promise, never
   execution. Completing the draft minted **SO-1320 · Rev 1** as a NEW identity with
   `paid = 0.00`, `delivery_date = null`, `delivery_date_tbd = true`, `proceed_date = null`, zero
   payments and zero PO/DO/unit links, while **SO-1303 was left unchanged**. Identity is never
   duplicated; a copy is a new transaction.
6. **CLOSED / PRODUCTION-VERIFIED 2026-08-14 — Cancel SO** — exact source commit `1fbcf2a3` passed
   PR #767 CI, then merged unaltered as parent of `bea6d0a5`. The `Deploy production` run repeated
   the authoritative gate on that exact SHA, deployed both governed Pages projects and the
   production Worker (Version ID `8cdb5b60-81a4-4086-ac77-df3167d4e355`), and
   `verify-production.mjs` proved all five canonical surfaces report `bea6d0a5`. Migration **0350**
   was applied and probed before the UI shipped.

   **The act was already governed; what was missing was the DOOR.** Card 7 measured the
   cancellation lineage true in 2026-08-11, and this slice adds no new writer: the register's
   `Cancel SO` and the Workspace's `Cancel SO` both reach the one existing
   `POST /api/orders/:id/cancel`. 0350 adds the READ (`sales_order_cancel_impact`, reporting the
   SAME seven owners the amendment preview reads) and two rules on the act — **the reason is now
   REQUIRED**, and the history row carries the actor plus the impact snapshot taken *before* the
   write. **The place-only guard is unchanged and deliberately so:** a proceeded order fails safe,
   and the governed proceeded-cancel remains Card 7's named, deferred approval lane.

   **0350 also repaired a measured drift.** The repository's only definition of `cancel_order` was
   `0011`, which still read the renamed `dl` column and admitted the retired `logistics` role;
   production had been running a corrected body **no migration in this repository contained**, so a
   fresh database would have built a broken function. The current governed body is now in the
   repository.

   **One door, not two.** `CancelOrderDialog` was exported and rendered by NOTHING — the D10
   pattern — and was the only door that permitted a blank reason. It is deleted rather than kept as
   a second form for one act (ownership Law C). Both live callers, the POS and raw-entry Stripe
   pending-order paths, already passed a real sentence, so tightening the schema regressed nothing.

   Authenticated production verification on `erp.carresofficial.com`: the row context menu ends in
   `Cancel SO`, alone below a divider. On **SO-1320** the dialog refused to act while the reason was
   blank and enabled only once one was typed; cancelling stamped `status = cancelled`, the reason in
   both the history text and `metadata.reason`, `by_role = operation`, a non-null `by_user_id`,
   server time, `metadata.impact` capturing `status = place` and `paid = 0.00` **as at the moment of
   the decision**, one `audit_log` row, and **every order line kept**. On the proceeded **SO-1313**
   the same door showed `Only an order still at Placed can be cancelled here.` with **no reason box
   and no destructive action at all** — the screen fails safe exactly where the database does.
7. **CLOSED / PRODUCTION-VERIFIED 2026-08-14 — Sales Order Settings** — exact source commit
   `ea9b344a` passed PR #768 CI, then merged unaltered as parent of `b9b2cf95`. The `Deploy
   production` run repeated the authoritative gate on that exact SHA, deployed both governed Pages
   projects and the production Worker (Version ID `4d21f4f0-d315-4f6a-a21b-c782e69bd5d2`), and
   `verify-production.mjs` proved all five canonical surfaces report `b9b2cf95`. No schema
   migration: the config rows already existed; what was missing was the owned home.

   Authenticated production verification on `erp.carresofficial.com`: the Page Header gear on Sales
   Orders now opens the launcher — `Sales Order Settings` first, then `All System Settings` — and
   the `Coming soon.` placeholder is gone. `Sales Order Settings` opens the one Settings Workspace
   with its section navigation (`Sales Order Settings` · `Purchasing Settings`) and renders the
   Order Entry editor live: payment methods (`online` · `credit` with its Bank follow-up ·
   `installment` · `cash`, plus the system `stripe` row) and the POS Customer-step form fields with
   their locked spine. The page states *"These settings are shared by everyone, and they never
   change an order that is already saved."* The `NOT SET HERE` panel names the five lists this page
   refuses to edit and their owners — **Dealers and showrooms — Stores · Salespeople — HR · Item
   groups and products — Operation Catalog · Warehouses and locations — Stock · Logistics companies
   — Delivery** — and register columns/saved views are stated as belonging to the person, on the
   Register.

   **One 🟡 found in production and fixed in the same closeout:** `Purchasing Settings` rendered
   inside the Workspace brought the whole Purchasing tab bar with it, so the operator saw two
   navigations at once. It now takes the same `embedded` flag `OrderEntryPage` does; the standalone
   Purchasing tab is untouched.
8. **NOT BUILT — Scan Order / Intake.** The accepted source is now settled by evidence and is
   recorded under §11; the capability keeps its own card. See *Sales Order Intake* below.

**Recommended build sequence:** Register + document actions → authoritative Detail/Edit → Amendment/
Revision/History → Order Route → Copy → Cancel → Sales Order Settings → Scan Order. Settings precedes
Scan Order because the extractor may only answer an option field by matching the ACTIVE list a
settings surface owns. The first two establish the
single field and navigation contract; the amendment slice establishes immutable version truth before
route and cancellation consume it.

---

# ✅ SALES ORDERS REFERENCE IMPLEMENTATION — STAGE A CLOSED 2026-08-10

The official Sales Orders destination now follows the approved UI Constitution. This card
changed composition and the reference-grid visual baseline only; it did not reopen the
business engine or the route cutover.

```
DestinationHeader  44px  one Sales Orders identity; no duplicate tab/title
Work Toolbar       45px  View · Search · Export · Columns · Scan · New · overflow;
                          selection replaces this same governed row
Work Surface             DataGrid owns both scroll axes + one fixed status footer
```

The DataGrid follows the current Register Template: rendered 36px header, 38px single-line parent
rows, 32px fixed status footer and 8px outer frame gaps, with frozen Carres typography, a flat
grid, faint dividers and no zebra. It preserves
server Search, typed column filters, Columns, Excel Export, resize, reorder, the existing
browser layout key and expanded order lines.

**Measured against the production bundle shape at 1920 · 1440 · 1130:** every target rendered
exactly; one destination identity, Search and Work Toolbar; zero Sales Orders tabs; no outer
scroll. At 1130 the 846px toolbar fit one row with no clipped child, while the 1,152px grid
kept its own 306px horizontal overflow. Search returned the matching orders; a Customer filter
reduced 74 rows to 1 and Clear restored 74; Phone remained visible after reload; expansion
opened one line-item disclosure; Export downloaded an XLSX file; browser console errors: zero.

**Owner accepted this as the first production reference implementation of the approved Carres
destination/listing architecture. Stage B is not started.** Expansion + virtualization is an
acknowledged DataGrid engine debt; it does not block the ERP UI migration unless measured
production scale or performance proves otherwise. Sales Order Workspace, Old Orders execution,
Delivery, Payments and Purchasing are unchanged.

## §0.2 · TWO DOORS — the production cutover, owner ruling 2026-08-10

**The Orders module has TWO routes, and neither may serve the other's page.**
Ruled in [`docs/SALES-ORDER-CUTOVER.md`](../SALES-ORDER-CUTOVER.md), which is the
authority for the dismantling; this section only records what is wired.

```
/operation/orders[/:stage]      SalesOrdersRegister      OFFICIAL "Sales Orders"
/operation/orders/so/new|:id    SalesOrderWorkspace      the order itself
/operation/old-orders[/:stage]  OperationOrdersControl   "Old Orders (temporary)"
```

**The old page is NOT deleted and NOT hidden.** It still carries every Delivery,
Payment and Purchasing signal there is, plus the AutoCount import — and that
import, being the only import surface, is what blocks the final delete. It is
FROZEN: blocker and data-defect fixes only, no new features, no UI changes.

**The word `(temporary)` is load-bearing**, in the sidebar and on the nameplate
both. A legacy surface that looks permanent becomes permanent. When the last box
on the cutover map is empty, that nav item and that route are DELETED — never
renamed into something that sounds permanent.

**The temporary door is `/operation/old-orders`, never `/operation/orders/old`.**
The sidebar decides its highlight with `pathname.startsWith(item.path)`, so a
sub-path of the register would light BOTH items at once.

**A REGISTER-ONLY IA RECOMMENDATION WAS DRAFTED 2026-08-08 AND NOT APPROVED.** It is
deliberately NOT recorded here: it was reasoned from the source and the measurements, which is
exactly the method that produced this checkpoint. **The next chat starts from the operator.**

---

# ✅ CUSTOMER OBLIGATION TRUTH — SO V2 CARD 1, SHIPPED 2026-08-11

**The question this card installed:** for any Sales Order, *what is the
customer's CURRENT committed order, and how did it become this?* — answered
without reading a PO, warehouse notes, the Issue Tracker, `operation_stage`
or the drawer PipelineStatus.

```
CUSTOMER COMMITMENT  =  orders + order_lines + order_addons  (the live rows)
LINEAGE              =  sales_order_revisions  (immutable, 0327)  + change_type (0340)
THE ONE READ         =  sales_order_commitment_bundle → resolveCurrentCustomerCommitment
                        (packages/shared/src/sales-order-commitment.ts ·
                         GET /api/operation/orders/:id/commitment)
```

**Authority flows DOWN — commitment → purchasing/fulfilment → PO/unit/delivery.
It is NEVER inferred backwards.** The bundle reads nothing from
`purchase_orders`, units, receiving, booking, stages or `status='delivered'`,
and the negative control proves it: forcing legacy status words on an order
changes nothing in the answer (run live 2026-08-11, `bundle_identical = true`).

**A contractual change now states its cause** (`sales_order_revisions.change_type`):

```
Staff correction   the RECORD was wrong — the customer's agreement never changed
Customer change    the customer asked for something different
```

A save that moves items or the promised date REFUSES without one
(`change_type_required`); a contact/address-only fix defaults to Staff
correction. A FULFILMENT REPLACEMENT is deliberately NOT a cause — a failed
delivery never revises the customer's order (that truth is Card 2/Card 5's).

**The SAVE door got the floors it always claimed** (0340): GATE 7
(delivered/cancelled → contractual fields frozen), the received floor and the
invoice floor now BLOCK at `sales_order_save_revision`, with the evaluator's
own sentence — they were previously a read-only advisory the write ignored.
And the 0257 `line_in_production` gate now guards this door too: removing or
re-SKUing a line that carries an `order_supplier_threads` row refuses — the
thread, born at ops confirm, is the only production-commitment fact there is,
and no new one was invented.

**Legacy authority retired from this decision (spec §11):** `operation_stage`
· drawer PipelineStatus · `Done` · `orders.status='delivered'` · booking stage
· PO existence · receiving status · `line_stock_status` — none of these may
determine current customer commitment. The columns remain; their AUTHORITY
over this question is gone.

**Known boundaries, reported not hidden:**
- POS doors (`add_order_lines` · `replace_order_lines` · `edit_order_addon` ·
  `update_order`) still mint NO revision — their lineage lives in
  `order_history` + `order_change_requests`. An approved+applied change
  request IS the customer-change record on that lane. Unifying them onto the
  revision ledger is a later card.
- The Stage-3 amendment lane (ISSUE/ACCEPT/APPLY, 3.6–3.8) stays walled; until
  it lands, the governed path for a customer change is the SAVE door with
  `change_type='customer_change'`, exactly as Stage 2 shipped it — Card 1
  labels the act, it does not open a new one.
- Cannot answer "how much is physically fulfilled" — that is Card 2 (units)
  + Card 5 (delivery attempts), on purpose.

**Evidence order SO-1318** (`CARD-1 EVIDENCE`) carries the proven chain: Rev 1
original → Rev 2 Staff correction → Rev 3 Customer change → Rev 4 contact fix
(auto Staff correction). Keep until Card 1 is owner-accepted, then it may be
cleaned with the other fixtures.

---

# ✅ UNIT / STOCK ALLOCATION TRUTH — SO V2 CARD 2, SHIPPED 2026-08-11

**The question this card installed:** for any Sales Order, *which real Units
exist for it, where are they, in what condition, which SO holds them, which PO
bore them — and how much of the current commitment is still unallocated?*

**THE TRACE CAME FIRST, AND IT CHANGED THE BUILD.** Every Unit door was read
before a line was written, and the measured answer is that **the approved
physical spine already runs on production**:

```
PO placed        _operation_create_po_inner mints one unit_code per physical
                 piece (id-abc123456), status incoming — 0153/0154, live body
                 verified 2026-08-11; 47 live po_mint units. The governed
                 purchasing_issue_pos_batch (0337/0339) reaches this same helper,
                 so every governed Issue births its units.
Receiving        office_receive_post / warehouse_receipt_check_in both call
                 operation_receive_po_with_do (live-verified): incoming→free,
                 damaged/wrong→on_hold + auto supplier claim (0288/0299),
                 replacement shortfall re-minted (R4).
Cancel           operation_cancel_po: incoming→voided.
Location         warehouse_id + condition per unit; 0307's trigger moves
                 incoming units when the PO destination moves.
Offer → human    the drawer's Ready picker and To Order's Reserve both end in
                 ops_stock_pool_draw — ONE governed draw door: ref required,
                 six locked reasons, pool-usage ledger + audit + order activity
                 in the same transaction (0292/0322).
Release          ops_stock_release: reserved→free, ref → ref_history.
```

**What the trace found BROKEN against the approved law — four defects, all
closed this card:**

```
①  operation_attach_do_and_deliver picked sold units FIFO from
   ('incoming','free','reserved') with NO ref filter — a delivery could
   silently sell a unit reserved to a DIFFERENT customer.       → 0341: the
   pick takes THIS order's reserved units FIRST and never touches any other
   ref (another SO, a LOAN).
②  autoReserveReceivedToSourceOrder silently reserved WHOLE-POOL free units
   to a PO's source order on every receive — no human, no ledger.
   → scoped to po_no = this PO: labelling the goods bought FOR the order is
   the purchase intent honoured; allocating EXISTING stock stays human-only.
③  A wrong / surplus / released / customer-rejected unit had NO route to
   Hold (0299: entry from incoming only, exit claim-keyed only).
   → 0341: the INSPECTION doors — ops_stock_hold_unit (free|reserved →
   on_hold, reasons customer_return · inspection, NO claim; the old ref moves
   into ref_history) and ops_stock_resolve_unit_hold (back_to_stock ·
   written_off). A claimless hold can NEVER leave as returned_to_supplier —
   supplier returns walk only with a claim, so the claims engine keeps its
   single Receiving entrance.
④  DELETE /ops/stock/:itemId hard-deleted ANY non-held unit, reserved or
   sold included. → 0341's guard: only incoming | free | voided rows (mis-key
   fixes) may leave the register; a committed unit is resolved, never deleted.
```

**THE ONE READ** (the half Card 1 deliberately could not answer):

```
UNIT ALLOCATION  =  resolveUnitAllocation
                    (packages/shared/src/sales-order-allocation.ts ·
                     GET /api/operation/orders/:id/allocation)
```

Committed quantities come from Card 1's commitment resolver; the physical side
comes from the per-unit register — **the register is the authority, never a
rollup**. Matching runs under `normalizeSkuKey` (the same rule the picker and
the labelling use); a bulk row (0218) counts its `qty`; a unit reserved/sold to
this SO that matches no committed line is **surfaced in `unmatchedUnits`,
never hidden**. The read touches no stage, booking state or legacy status
word, and the reservation match is the EXACT ref `SO-{n}` — `LOAN SO-{n}` is a
different obligation and is excluded by construction.

**PRODUCTION EVIDENCE — run 2026-08-11, not described.** Migration 0341
applied; nine probes as the real `authenticated` operation user inside one
transaction, aborted at the end — register identical before and after
(91 free · 43 incoming · 1 returned_to_supplier, zero probe rows):

```
P1 free → on_hold (customer_return), claimless, held_at stamped     PASS
P2 resolve back_to_stock → free, hold_released_at stamped           PASS
P3 governed draw → hold: old ref into ref_history, ref cleared      PASS
P4 incoming refused the inspection door (P0001)                     PASS
P5 claimless hold → returned_to_supplier refused by the guard       PASS
P6 reserved unit hard-delete refused (unit_committed_not_deletable) PASS
P7 'returned' refused as a claimless outcome                        PASS
P8 delivery pick: this SO's reserved unit FIRST, other SO's
   reserved unit EXCLUDED                                           PASS
P9 negative control: forcing legacy delivered words on the order
   changed NOTHING in the register answer                           PASS
```

**Deploy.** PR #727 merged as `9b530498` · API Worker version
`1e8e8427-1ae8-4076-9477-309ec910c5a6` · `/health` 200 `{"ok":true}` ·
`GET /:id/allocation`, `POST /ops/stock/hold`, `POST /ops/stock/hold-resolve`
all mounted and 401 unauthenticated. No web deploy: Card 2 ships no UI.
Tests: shared 2244 · api 2171 · api tsc clean.

**Known boundaries, reported not hidden:**
- The loan flow still reserves/releases by direct PostgREST update
  (`order-control.ts:1666/1703/1929`, ref `LOAN SO-{n}`) — human-decided and
  guard-protected, but outside the pool ledger. Card 6's lane.
- `transferred` has no writer anywhere — multi-hop warehouse transfer is
  unbuilt (Stock's future movement door).
- **Supplier labelling surface is owed**: unit codes exist from PO placement
  and `GET /operation/pos/:id/units` returns them, but no supplier-facing
  document prints them. The PO PDF is frozen; this belongs to a PO-document
  card, not here.
- Reservation identity remains the exact text ref `SO-{n}` (the booking gate
  and every reader key on it). A governed FK was considered and dropped —
  the resolver `_activity_log_order_id_from_ref` already maps ref → order,
  and a second identity column nobody reads is the defect, not the fix.
- Splitting a bulk row on partial reserve stays Stock MASTER §8 evolution.
- Out-for-delivery / delivered / returned movement states are Card 5's.
- No UI was added: Card 2 is a truth card. The Work engine (Card 9) and the
  register surfaces decide what the operator sees; the doors are governed
  RPCs behind `POST /api/ops/stock/hold` · `/hold-resolve`.

**Stock MASTER §6's "entry from incoming only" was overwritten in this same
PR** — the entry rule and the way out moved in the SAME change, exactly as
that rule demanded: claim quarantine (damaged · wrong_item) still enters only
from `incoming` at Receiving; the claimless inspection hold enters only from
`free`/`reserved` and exits only back_to_stock / written_off.

---

# ✅ EARLY LOGISTICS ASSIGNMENT + CUSTOMER BOOKING — SO V2 CARD 3, SHIPPED 2026-08-13

> **This record OVERWRITES the 2026-08-11 Card 3 entry (MASTER OVERWRITE LAW).**
> That entry shipped migration `0342` (the call window 1 → 3 working days) and the
> Delivery page's un-passed `queueLeads` fix — **both remain true and are kept
> below.** It then declared the approved flow "already unblocked" on the strength
> of the ENGINE permitting early assignment. The 2026-08-13 ruling restated Card 3
> in full, and re-tracing it against production found that reading was wrong where
> it mattered: the engine permitted the work, and the operator's own workspace
> never showed it. Git is the history; this section is the one current truth.

**The question this card installed:** logistics is assigned as soon as the
fulfilment route is known, the customer conversation happens **three actual
working days** before the promised deadline **whether or not the goods are in**,
and the operator holding the phone has the four facts in front of them.

## The measured gap — the reason the earlier reading was wrong

```
Production, 2026-08-13:   86 live orders
                          51 with a logistics company assigned
                           0 customer appointments EVER confirmed
```

**Early assignment was happening. The booking conversation was not, and had
never once been recorded.**

The Delivery board scoped its rows with `nextActionOf` — **Layer 2**, the ONE
action that LEADS a row across all three tracks. `ACTION-FLOW-STANDARD` Law 4
ranks goods work (`issue_po` 31 · `confirm_ready_date` 30) ABOVE delivery
preparation (`assign_logistics` 40 · `confirm_delivery_date` 41). So for every
order whose goods were not yet in, the headline was a goods action and **the
order was invisible on the logistics operator's own page** — which put two of
the ruling's permanent rules out of reach in practice:

```
Rule 1  "Assign Logistics early ... do NOT wait until stock is physically ready"
Rule 2  "Customer contact happens at T−3 ... regardless of stock readiness.
         Got stock or no stock, Logistics still starts the conversation."
```

**The 2026-08-11 entry named this and deferred it as "a display-priority
re-ruling of Law 4".** That was the wrong diagnosis, and naming it is the
point of this overwrite: Law 4 governs **which action leads a SALES ORDER
ROW**. It was never the right rule for **which orders are delivery work** —
and this module's own MASTER §3 already says so: *"the Orders list sorts by
risk to the PROMISE; this page sorts by risk to the TRUCK."* Membership was
still being decided by the other page's lens. **Nothing about Law 4 changed,
and no word on any screen changed.**

## What shipped

```
MEMBERSHIP        the Delivery board reads the DELIVERY TRACK of the same
                  Layer-1 output (`openActionsOf(...).find(track==='delivery')`)
                  instead of the cross-track headline. One engine, one signal
                  mapping, one set of words — the Orders list runs the identical
                  call, so the two pages still cannot name a step differently.
                  · PayHold survives BY CONSTRUCTION: a money-held order's
                    delivery track is silent (`deliveryHeldOnMoney`), so it
                    leaves the board without a rule saying so — exactly as before.
                  · Queue-less rows still build and still carry the ORDER's
                    headline, so a held order reads `Collect RM … 🔒` here
                    exactly as it does on the Orders list.
                  · The assign step still waits on the ruling's OWN trigger —
                    *"Ready Stock route known OR Purchase Order placed"*. An
                    open `Issue PO` is neither, so goods nobody has bought stay
                    off the board. Rule 1 forbids waiting for goods to be READY,
                    not for them to be BOUGHT.

THE BRIEF         `resolveBookingBrief` (packages/shared/src/booking-brief.ts ·
                  GET /api/operation/orders/:id/booking-brief) — the ONE
                  arithmetic for the T−3 call, composed from the authoritative
                  owners and never re-derived: Card 1 commitment → Card 2
                  allocation → the overlay's booking + supplier dates → the
                  partner roster → `logistics_call_working_days` through the
                  SAME `deliveryQueueLeads` helper both other surfaces read.
                  It answers the ruling's own list — customer promised deadline ·
                  latest expected arrival · expected delivery scope · what IS
                  and IS NOT expected in — and it renders with an EMPTY
                  warehouse, which is the whole of Rule 3: *"Stock ETA informs
                  the conversation; it does not decide whether it happens."*

THE APPOINTMENT   migration `0347` · `ops_order_control.confirmed_partner_id`.
NAMES ITS         Three of the four facts the ruling requires of an appointment
CARRIER           were already stored — `confirmed_date` + `confirmed_time_slot`
                  (0277) and `booking_groups` (0282). The CARRIER was not stored
                  at all: every reader took whichever company sat on
                  `orders.ops_assigned_logistic` right now, so a reassignment
                  silently rewrote which company the customer's agreed day
                  belonged to, and the trips archived in `delivery_trips` named
                  no carrier even in principle. Now stamped ONCE at confirmation
                  (FK to delivery_partners, CHECK-enforced whenever the stage is
                  `confirmed`), archived with the superseded trip, logged to the
                  order timeline BY NAME, and never re-read. The confirm door
                  refuses with no assignment (`booking_no_logistics`) — not a new
                  gate on the conversation (the engine already opens the call
                  only once logistics is assigned), but a refusal to record an
                  appointment that cannot say who is driving.
                  · DRIFT IS SHOWN, NOT SWALLOWED: when the assigned company and
                    the agreed company differ, the pane names both and names the
                    fix, per the delivery-rule word law.

KEPT FROM 0342    `logistics_call_working_days` = 3 (the owner's "three actual
                  working days"), its ledger row and audit sentence, and the
                  Delivery page's fixed `queueLeads` pass-through. Both still
                  true; neither is re-done.

WORDS             COPY-STANDARD gained "The booking-call words" — `Before you
                  call` · `Call by {date}` · `Not in yet` · `Everything is on
                  hand` · `Expected arrival` (and the rule that **`Stock ETA`
                  may not reach the screen** — `ETA` is an abbreviation).
                  NO `Appointment` noun was minted: the screen already spells
                  that fact `{logistics} · confirmed {date} · {slot}`, and a
                  second noun for one fact is the synonym rule 8 forbids.
```

**Production evidence — run 2026-08-13, not described.** `0347` applied; six
probes as the real operation user in one aborted transaction — the register
identical after (86 control rows · 0 confirmed · 0 carrier stamps · 51 assigned ·
0 carrier timeline rows), and the probe order's original logistics company
untouched:

```
P1 a confirmed booking with NO carrier refused by the CHECK          PASS
P2 with a carrier it is accepted and the carrier is stored           PASS
P3 reassigning logistics left the customer-agreed carrier alone      PASS
P4 the timeline records the carrier change by NAME                   PASS
P5 the FK refuses a carrier that is not a delivery_partners row      PASS
P6 below `confirmed` there is no appointment to attribute            PASS
```

Tests: shared **2291** · api **2183** · web `OperationDelivery` **21** (five new,
one per rule) · shared/api/web `tsc` clean · web build clean.

**Deploy — verified live, not assumed.** main `2c2beb4f` · API Worker version
`d82b059f-19f9-4b55-af5e-20cab71dbdc5` · `/health` 200 `{"ok":true}` ·
`GET /:id/booking-brief` mounted and **401** unauthenticated (as is
`POST /:id/booking/confirm`). Web bundle `index-CuV1kkhk.js` deployed to
**both** Pages projects and confirmed serving on all four production hosts —
`pos.carresofficial.com` · `erp.carresofficial.com` · `carres-portal.pages.dev` ·
`carres-pos.pages.dev`. *(`carres-portal` alone leaves the POS domain on the old
bundle — checked, caught and fixed during this deploy rather than reported as
done.)* The live bundle was then grepped for the card's own strings: `Before you
call` · `Not in yet` · `Everything is on hand` · `booking-brief` · the drift
sentence — all present.

**Known boundaries, reported not hidden:**
- **The brief is rendered on the Delivery workspace only.** The Sales Order
  Workspace and the Work feed (Cards 9/10) read the same endpoint when their
  surfaces call for it; the registry is the contract, and no second arithmetic
  may be written for them.
- **`assign_logistics` still has no early DEADLINE** — its backstop stays
  `promised date − 3 working days`. Assignment is now VISIBLE from the moment
  the route is known, which is what Rule 1 asks for; anchoring a deadline on
  PO-placement day would mark every order late on day two. If the owner means
  it as a deadline, the anchor is one line in `delivery-queue.ts`.
- **The board still cannot show `issue_delivery_order`** — it is a delivery-track
  action with no queue of its own (the four queues are fixed), so an order
  waiting only on the document is queue-less. It reaches the pane through the
  calendar. A fifth queue is a business decision, not a defect.
- **Capacity is still only WARNED, never reserved.** The ruling's *"expose /
  reserve future delivery capacity"* is served today by the carrier's own
  `daily_capacity` warning and the calendar's per-carrier day counts
  (Delivery MASTER §4/§5). A HELD slot — capacity consumed before the customer
  says yes — would be a new record, and §6.2 (the trip is a derived view)
  is the ruling it would have to reopen. Not this card.
- Pre-existing and untouched: the design guard reports 98 grey hovers against a
  baseline of 96. Verified identical in the committed tree and this working tree
  (120 occurrences both), so the two are earlier debt on `main`, not this card's.

---

# ✅ MONEY TRUTH + COLLECTION GATE — SO V2 CARD 4, SHIPPED 2026-08-11

**The question this card installed:** payment is recorded ONCE, changes money
truth ONCE, every reader derives the same answer — and the balance is pressed
on the working calendar (T−3 · T−2 attention, T−1 final deadline) because
logistics ask for the DO the evening before and the DO door refuses while
money holds.

**THE TRACE CAME FIRST — what already stood, verified not assumed:**

```
ONE calculation      orderMoney (orders.paid is the truth) — four readers
DO hard gate         deliveryOrderIssueGate refuses on money (422, tested)
PayHold              🔒 + "you do not arrange a delivery you may not make"
Delivered ≠ paid     collect survives delivery; money red after delivery
Dead columns         ops_order_control.paid_amount 0 rows · payment_status 1 row
                     · order_payments 0 rows — writers, no reader of truth
```

**And the violation:** the desk's Record-payment door wrote ONLY the dead
ledger — an operator could record a customer's balance and `orders.paid`, the
figure every gate reads, never moved; the DO stayed refused. Void was worse:
it hard-DELETED the ledger row.

**What shipped (migration 0343 + the routes over it):**

```
payment_record   the ONE payment writer. Ledger row + orders.paid bump
                 (payment/deposit) or the storage gate stamp (storage) in ONE
                 transaction. p_counts_toward_paid=false records the raw-create
                 deposit MIRROR (already inside orders.paid at birth) —
                 `counted_in_paid` on the row tells void what to reverse.
payment_void     principal only. A STAMP (voided_at/by/reason), never a
                 delete; reverses exactly the contribution the record made;
                 a storage void closes the gate only when no live storage
                 collection remains.
door closed      the FOR ALL write policy dropped; authenticated lost
                 INSERT/UPDATE/DELETE on order_payments. Reads stay internal.
receipts         the LOCKED scheme at last — RC-DDMMYY-NNNN via docNumber
                 (the ONE TS helper; the RPC never spells it), seeded
                 {orderId}:{seq} so a reprint matches. The ledger held ZERO
                 rows, so retiring R{so}-{n} cost nothing.
collection clock packages/shared/src/collection-clock.ts — ONE arithmetic:
                 due = delivery − 1 working day (Mon–Sat + MY holidays),
                 attention t3/t2/t1/late; anchored on the CUSTOMER's confirmed
                 day, else the promised date; TBD stays silent. Wired on the
                 collections desk (`balance due {date}` beside the collect
                 pill, tone ramps t3→late); Card 9's work engine consumes the
                 same module.
```

**Production evidence — run 2026-08-11, not described.** 0343 applied; seven
probes as the real operation/principal users in one aborted transaction —
ledger 0 rows and Σ orders.paid RM 54,100.00 identical before and after:

```
P1 record as operation: orders.paid +123.45, ledger row, counted   PASS
P2 mirror row (counts=false): paid untouched                       PASS
P3 operation cannot void (42501)                                   PASS
P4 principal void: paid reverts EXACTLY, the row survives stamped  PASS
P5 double void refused                                             PASS
P6 storage kind: gate stamps, orders.paid untouched                PASS
P7 direct INSERT as authenticated: 42501                           PASS
```

## CARD 4 · THE CLOSING SLICE — SHIPPED 2026-08-13 (migration 0347)

**Card 4 was re-audited top to toe against production before anything was
written**, and it found the defect its own 0343 had planted: **turning VOID
from a DELETE into a STAMP was right — money history is never erased — but
every READER of that ledger was written when a void deleted the row.** Four
of them counted and printed a reversed payment:

```
SO document       `PAYMENTS RECEIVED` listed voided rows — on the page the
                  CUSTOMER reads
Order drawer      the storage-collected sum, the receipt list, `Print receipt`
                  and the history row all treated a voided payment as money
Collections desk  the storage sum, through summarizePayments
```

**The ledger holds 0 rows on production, so nothing was wrong on screen — all
of it would have gone wrong on the first void.** Fixed by ONE predicate,
`isLivePayment` (Law D): no reader spells `voided_at` for itself, and
`summarizePayments` — the one roll-up — skips a voided row. The drawer keeps
the row visible, struck through and labelled `Voided`, with no receipt to
print and no second void to attempt.

**Two more competing money truths closed in the same slice:**

```
payment_status  the desk read a HAND-TYPED word for its facet, its row pill
                and its "still to collect" predicate — a second money truth
                beside the arithmetic. Measured: ONE row of 88 carries the
                column, so the facet said `Unset` for 87 orders while 25 had
                money in. Now DERIVED (Overdue · Unpaid · Partial · Paid ·
                No price yet) from orderMoney + the collection clock; the
                dropdown is gone, the column keeps its data and loses its
                authority. `Follow Up` retired — never a money fact.
receipt number  `count + 1` seeding mints the SAME number for two payments
                recorded in one instant, and nothing stopped it being stored.
                Now a partial unique index + a 3-attempt retry in the route
                (an index without a retry is a 500 at the till).
```

**And money now leaves a trace on its own order**: `payment.received` /
`payment.voided` (declared in the taxonomy 2026-07-10, never written by
anyone) are stamped inside the same transaction as the money, carrying the
amount, the kind, the receipt number and the void reason. The timeline prints
the figure — `RM 3,500.00 · RC-130826-4821` — because a bare "Payment
received" on a row whose whole purpose is the amount is the vague wording the
standard bans.

**Production evidence — run 2026-08-13, not described.** 0347 applied; nine
probes as the real operation/principal users in two aborted transactions —
`order_payments` 0 rows, Σ `orders.paid` RM 55,350.00 and 0 `payment.*`
activity rows, identical before and after:

```
P1 record as operation: orders.paid +123.45                        PASS
P2 payment.received written to the ORDER activity with its figure  PASS
P3 duplicate receipt number refused by the index (23505)           PASS
P4 storage kind: gate stamps, orders.paid untouched                PASS
P5 operation cannot void (42501)                                   PASS
P6 principal void: orders.paid reverts EXACTLY                     PASS
P7 the voided row survives, stamped with who and why               PASS
P8 payment.voided on the order activity, with amount + reason      PASS
P9 voiding the only storage collection closes the gate again       PASS
```

Tests: shared 2276 · api 2174 · web +9 (the derived money state, the money
timeline line, the drawer's four void readers). The two
`OperationPurchaseOrders` failures under the full web run are a pre-existing
parallel-load timeout — that file passes alone and touches no money code.

**Known boundaries, reported not hidden:**
- **`online` prints as "Online" on the SO document and "e-wallet" in the
  drawer** — one payment method, two words. Left alone deliberately: picking
  the winner is a COPY-STANDARD ruling, not an engineering call, so the
  activity line omits the method rather than minting a third spelling.
- **Money is bilateral; the REFUND record arrives with Card 7** (change /
  cancel / refund lineage) — "an approved but unpaid refund means Carres still
  owes the customer" needs the lineage that card owns; minting a refund store
  without it would be an unowned record.
- `ops_order_control.balance` keeps its one legitimate role: the hand-keyed
  OUTSTANDING for imported rows with unpriced lines (orderMoney's fallback).
  `paid_amount` (0 rows) and `payment_status` (1 row) keep their columns and
  lose nothing further — they never had authority over the gates.
- `top_up_order` / `record_stripe_checkout_payment` still write orders.paid on
  their own lanes (POS top-up · Stripe webhook). Each records once and changes
  truth once on its own evidence; folding them into payment_record is a later
  unification, not a defect — neither double-writes the ledger.
- The desk's promise-to-pay (`balance_due_date`) and the Card 4 clock coexist:
  one is the customer's word, the other is the business deadline. Both print.

---

# ✅ DELIVERY ATTEMPT + DELIVERY EXCEPTION — SO V2 CARD 5, SHIPPED 2026-08-11

**The question this card installed:** every vehicle run for an order leaves a
record; a non-completed run is ONE Delivery Exception; the Unit moves with
reality; bed-delivered-while-sofa-remains is partial fulfilment, never a
whole-order delivered word.

**THE TRACE FOUND THE FIRST GENUINE ENGINE GAP of this programme:** no attempt
store, no exception store, and the one success door
(`operation_attach_do_and_deliver`) flips the WHOLE order delivered — a failed
run left nothing but a rebooking, and a partial delivery had no truthful
record at all.

**The model, and why §6.2 ("the trip is a derived view") survives untouched:**
an ATTEMPT is what the portal OBSERVED happen on one run FOR ONE ORDER — a
fact about the order's delivery, never about the van. No trip record exists;
the §6.2 upgrade clause stays untriggered.

**What shipped (migration 0344):**

```
delivery_attempts        append-only (trigger-refused UPDATE/DELETE, no direct
+ delivery_attempt_units writes — RPC only, read internal). One row per run:
                         result delivered · partial · failed; a non-success
                         MUST carry reason_key + where_goods (CHECK).
delivery_attempt_record  the partial/failed door. The exception's reason is
                         the T4 REASON LIBRARY key (never a second word list —
                         the library gained `customer_rejected_goods` and
                         `delivery_failed`); where_goods ∈ returned_to_warehouse
                         · still_with_logistics · with_customer. Delivered
                         units flip to sold ONLY from `reserved to THIS SO`
                         (the Card 2 law, enforced again here); returned units
                         walk Card 2's own doors IN THE SAME TRANSACTION —
                         ops_stock_release → Available, or the customer_return
                         inspection hold → Hold. The ORDER STATUS is untouched:
                         partial stays Scheduled (the 5-stage lock).
success door             `operation_attach_do_and_deliver` now captures the
                         unit ids it sells and mints its own 'delivered'
                         attempt + unit rows — every trip leaves an attempt,
                         the success too. 0341's reservation-honouring pick is
                         preserved verbatim (sanity-asserted).
API                      POST /api/operation/orders/:id/delivery-attempt ·
                         GET /:id/delivery-attempts (history with unit
                         outcomes). No UI in this card — a truth card; the
                         Work engine (Card 9) and the delivery surfaces render
                         it, and any on-screen words need COPY-STANDARD
                         entries first.
```

**The four exception questions, answered by OWNERSHIP not by prose:**

```
1  What happened?              result + reason_key (+ note)
2  Where are the goods now?    where_goods + the unit doors the same
                               transaction walked
3  What does Carres still owe? DERIVED — Card 1 commitment − Card 2 allocation
                               (GET /:id/allocation). Never stored as prose.
4  Who does what next?         the Work engine's (Card 9), derived from these
                               facts. An attempt stores facts, not to-dos.
```

**Production evidence — run 2026-08-11, not described.** 0344 applied (one
type defect — `ops_assigned_logistic` is a uuid — caught by the probe itself,
fixed in the repo file and the live bodies before any commit); seven probes as
the real operation user in one aborted transaction — attempts 0 rows and the
register (91 free · 43 incoming · 1 other) identical after:

```
P1 failed attempt: exception recorded; one unit released → free, one
   → on_hold customer_return, in the same transaction               PASS
P2 the exception does NOT touch the order status                    PASS
P3 partial attempt: named reserved unit → sold to THIS order,
   attempt_no increments                                            PASS
P4 delivering a unit not reserved to this SO refused                PASS
P5 an exception without where_goods refused                         PASS
P6 history is append-only (UPDATE refused by trigger)               PASS
P7 direct INSERT as authenticated refused (42501)                   PASS
```

**Known boundaries, reported not hidden:**
- The Issue Tracker may record the same incident for accountability and
  learning; it cannot replace the attempt, the unit movement or the remaining
  obligation — the three-system law, applied.
- An `out_for_delivery` unit status was considered and NOT minted: the run is
  same-day, the attempt row is the observation, and a tenth status would touch
  every `('free','reserved')` filter in the portal for a state nothing reads
  overnight. If a multi-day in-transit reality appears, that is one status and
  one guard extension.
- A partial success still leaves `orders.status` untouched; Card 8's derived
  completion is where "everything delivered" becomes a whole-order answer.
  The success door's whole-order flip remains correct for the full-success
  path it gates.
- Attempts have no void lane — a wrong attempt is corrected by the next one
  (Receiving's Amend/Void pattern is the upgrade path if the business needs
  it; silently editable history cannot be un-shipped).

---

# ✅ LOAN MATTRESS / LOAN SOFA OBLIGATIONS — SO V2 CARD 6, SHIPPED 2026-08-11

**The question this card installed:** a temporary item is an INDEPENDENT
obligation — the real goods arriving does not close it — and a recovered
Carres loan unit reaches the sellable pool only through inspection.

**THE TRACE FOUND THE LANE ALREADY STRUCTURED — nearly all of Card 6's
approved rule was measured live** (`ops_sofa_loans`, 0209 generalised by
0217/0242):

```
Two loan kinds, distinct  source warehouse (identified unit, item_id) ·
                          source supplier (borrowed_sku/label + supplier_id)
Separate facts            returned_at (customer recovery) is NOT
                          returned_to_supplier_at (supplier return, its own
                          door, source-guarded, with supplier_return_due /
                          supplier_return_ref) — the exact split the card
                          demands, already enforced with 409s
Structured, never notes   the obligation is a row with its doc (loan_note_no
                          + signed stamp), out-leg routing and dates — no
                          free-text return date anywhere
Human decides             every door is an explicit operator act
```

**The ONE violation, fixed:** `POST /:id/loan-return` freed the recovered
unit STRAIGHT back to the sellable pool (a direct `status='free'` write).
The rule is *recovered → Warehouse inspection → Available / Hold* — a used
loan mattress must be looked at before it can be sold again. The route now
walks 0341's governed inspection door (`ops_stock_hold_unit`, reason
`inspection`; the LOAN ref moves into `ref_history`), and the unit reaches
Available only through `ops_stock_resolve_unit_hold` — or is written off.
**No migration: Card 2 built the doors; Card 6 made the lane use them.**

**Production evidence — run 2026-08-11.** Two rolled-back probes as the real
operation user: free → LOAN-reserved → inspection hold (ref in history, ref
cleared) → back_to_stock → free. Both PASS; zero residue. Tests: api 2171
(the loan-return test now asserts NO direct `ops_stock_items` write and the
inspection RPC call), tsc clean.

**Known boundaries, reported not hidden:**
- The loan CLAIM (`loan-sofa`) is still a two-write client sequence (direct
  reserve + loan insert with a manual rollback) — human-decided and
  transition-guarded, but non-atomic; its own comment documents the stranded-
  unit failure mode. Folding claim+record into one RPC is a later hardening,
  not a business rule.
- "The system may SUGGEST a loan when the real goods will miss the
  commitment" is the Work engine's (Card 9) — the delay radar already
  computes the miss; the suggestion is a derived work item, never an
  auto-loan.
- "Final delivery states both deliver + recover" is DERIVED: an open
  `ops_sofa_loans` row on a delivered order keeps the Loan track open —
  Card 8's completion reads it; no second status is minted.

---

# ✅ CHANGE / CANCEL / REFUND LINEAGE — SO V2 CARD 7, SHIPPED 2026-08-11

**The question this card installed:** the whole chain survives — original
order → governed revision/cancellation → fulfilment consequences →
replacement/released stock → financial consequence — and a cancelled goods
obligation can become a MONEY obligation with its own record.

**THE TRACE MEASURED THE LINEAGE LARGELY ALREADY TRUE**, built by the six
cards before it:

```
Change lineage     the immutable revision ledger (0327) + change_type (0340)
                   + the order_change_requests lane (Card 1's boundary)
Cancel             cancel_order stamps actor + reason + server time, deletes
                   nothing — and it structurally refuses a proceeded order
                   (only 'place' cancels), which IS §3.14's "cancel is not
                   allowed by default". operation_cancel_po cancels the
                   document, voids only never-arrived units, keeps every row.
Fulfilment chain   delivery_attempts append-only (0344) · unit ref_history
                   survives every move · a committed unit cannot be deleted
                   (0341) · GATE 7 (0340) freezes a cancelled order's
                   contractual fields.
```

**What did not exist anywhere: THE REFUND RECORD** — bilateral money's
second direction, deferred here by Card 4 by name. Migration `0345`:

```
order_refunds        requested → approved | rejected → paid. Amount + reason
                     required at birth; decision stamps (who · when · note,
                     note MANDATORY on reject); payout stamps (method ·
                     reference · who · when). CHECK constraints make a
                     stage without its stamps unrepresentable. Rows are
                     NEVER deleted (trigger) — a wrong ask is rejected.
refund_request       operation/principal.
refund_decide        THE PRINCIPAL ONLY — releasing money is a manager
                     decision (the storage-waiver law, applied again).
refund_mark_paid     approved → paid only. The payout never touches
                     orders.paid — that column is money IN against goods;
                     the refund is its own record, and an APPROVED, UNPAID
                     row is exactly "Carres still owes the customer",
                     which Card 8's derived completion reads.
API                  GET/POST /:id/refunds · POST /:id/refunds/:rid/decide ·
                     POST /:id/refunds/:rid/paid. No UI — a truth card.
```

**Production evidence — run 2026-08-11.** 0345 applied; eight probes as the
real operation/principal users in one aborted transaction — `order_refunds`
0 rows after:

```
P1 operation requests (requested)                              PASS
P2 operation cannot decide (42501)                             PASS
P3 an undecided refund cannot be paid                          PASS
P4 principal approves; approved+unpaid = open obligation       PASS
P5 payout: approved → paid, method recorded                    PASS
P6 a rejection without a note refused                          PASS
P7 a refund row can never be deleted                           PASS
P8 direct INSERT as authenticated refused (42501)              PASS
```

**Known boundaries, reported not hidden:**
- The Issue Tracker may hold the story of a cancellation or refund; it is
  never required to make the transaction lineage true (three-system law).
- §3.14's full cancel flow for a PROCEEDED order (approved cancel → the PO
  finishes → GRN into stockpile → the engine reassigns) has no dedicated
  door — today a proceeded order simply cannot be cancelled through
  `cancel_order`, which fails SAFE. When the business needs the governed
  proceeded-cancel, it arrives as an approval lane on `order_change_requests`
  (the same pattern the POS change lane uses), not as a loosened RPC.
- Refund money does not yet appear in the collections desk's figures — the
  desk shows money IN; the refund obligation is read by Card 8's completion
  and surfaced by Card 9's work engine.

---

# ✅ DERIVED COMPLETION — SO V2 CARD 8, SHIPPED 2026-08-11

**The question this card installed:** when is a Sales Order truly finished?
**Derived, never stored, never pressed:**

```
Goods clear + Money clear in BOTH directions + Loan clear (incl. supplier
return) = No Action Required
```

**Delivered ≠ Complete. Cancelled ≠ Complete.** Both are properties of the
arithmetic, pinned by tests — not of any column. No `completed` status was
minted anywhere; `Delivered` stays a physical fulfilment fact.

**What shipped — code only, no migration** (the four tracks were already
owned by Cards 1–7; Card 8 composes them):

```
resolveOrderCompletion   packages/shared/src/sales-order-completion.ts —
                         the ONE arithmetic (Law D). Reads:
                         GOODS      committed − sold (Card 1 − Card 2); a
                                    reserved-but-undelivered unit keeps it
                                    open; a cancelled order owes no goods but
                                    a unit still reserved to it is unfinished
                         MONEY IN   orderMoney.outstanding — survives
                                    delivery; UNKNOWN never blocks (the
                                    gates' own rule)
                         MONEY OUT  order_refunds — requested OR
                                    approved-unpaid keeps the SO open
                         LOAN       un-recovered loans AND supplier borrows
                                    not yet returned — two separate facts
                         Several open tracks are ALL reported — one never
                         hides another (the Law-1 shape, applied here).
GET /:id/completion      composes the four authoritative reads server-side:
                         commitment bundle → allocation → orderMoney (with
                         storageHold) → refunds → loans. The one legacy word
                         it may read is status='cancelled' — a CONTRACT fact
                         (GATE 7 freezes it), not a fulfilment summary.
```

**Evidence:** nine shared tests pin the arithmetic — the two ≠-Complete laws,
both loan halves, rejected/paid refunds not holding, unknown money never
blocking, multi-track reporting. api 2171 · shared 2263 · tsc clean; endpoint
mounted and 401-gated on production after deploy.

**Known boundaries, reported not hidden:**
- "Every refund / replacement / collection / other explicit commitment
  clear" — replacement obligations have no store of their own yet; a
  replacement today IS a goods obligation (the commitment still owes the
  line), so the goods track carries it. A distinct replacement record would
  arrive with the Service/claim execution lanes, not here.
- Sales Orders LISTS truth; it does not become the work queue — surfacing
  `No Action Required` and the open-track badges is Card 9/10's rendering,
  and any on-screen words need COPY-STANDARD entries first.

---

# ✅ UNIFIED WORK ENGINE — SO V2 CARD 9, SHIPPED 2026-08-11

**The question this card installed:** Work reads module facts and produces
**WHO + ACTION + OBJECT + WHEN (ACTUAL WORKING WEEKDAY/DATE)** — and every rule that enters the
engine names its five parts or does not enter.

**THE TRACE:** the per-module engines already exist and stay the owners of
WHAT is open (`order-actions` two-layer engine · the purchasing calls ·
`poCurrentActionOf` · `claimNextMove`) — V1's best idea, kept whole. The
signal mapping (`orderActionSignalsOf`) lives web-side as ONE mapping;
re-deriving it server-side would be a second signal mapping that drifts, so
Card 9 composes rather than re-derives.

**What shipped — shared code only** (`packages/shared/src/work-engine.ts`):

```
WORK_RULES         the FIVE-PART registry: Trigger · Owner · Action · Due
                   rule · Completion fact, as typed data. Tests enforce:
                   every key the order engine can raise has an entry; every
                   completion fact names a store or arithmetic (never a
                   tick); cross-module owners are DUTY-derived words
                   (PO-duty · GRN-duty offset−1 · claim = opening month's
                   holder), never a stored assignee.
workItemsForOrder  composes the engine's Layer-1 output into work items:
                   owner = the PIC (§2.2 — the PIC owns every action, so an
                   item carries no owner field of its own) · due through the
                   ONE shipped clock per key (assign/chase/deliver/photo →
                   delivery-queue with the Card 3 leads · delay clocks →
                   order-action-due, office week · collect AND
                   issue_delivery_order → the Card 4 T−1 clock, one
                   arithmetic two consumers) · `Thu 6 Aug` weekday+date
                   labels (never a bare Today) · workingDaysLate over the
                   ORIGINAL due, which never moves. Purchasing-owned clocks
                   (issue_po · confirm_ready_date) are NOT respelt — their
                   dues live on their own surfaces, pinned by test.
No Done button     structural: items exist only while their engine's facts
                   hold them open. Human follow-ups stay `ops_tasks` —
                   explicitly created, labelled human, explicitly
                   completable, OUTSIDE this registry.
```

**Evidence:** ten shared tests — the five-part enforcement, PIC ownership,
weekday+date spelling, late-keeps-original-due (with the working-day count),
the shared T−1 arithmetic, no-anchor-never-late, and the
no-respelt-purchasing-clock pin. shared 2273 · api/web tsc clean. No API or
DB change — nothing to deploy; Card 10 wires the surface.

**Known boundaries, reported not hidden:**
- The composed feed covers the ORDER track today. The purchasing / receiving
  / claims items are REGISTERED (five parts, completion facts) and render on
  their own surfaces; they join the one composed feed when their server
  feeds are wired — that is Card 10's surface work, and the registry is the
  contract it renders.
- The working calendar is still `myHolidaySet()` until the Settings company
  calendar lands (purchasing MASTER §10) — every clock takes it by injection.

---

# ✅ MY WORK / TEAM WORK — SO V2 CARD 10, SHIPPED 2026-08-11

**The question this card installed:** one operator opens the portal and sees
exactly what to do — **WHO + ACTION + OBJECT + WHEN (actual working weekday/date)** — and a manager
sees the same set with responsibility visible.

**Built under the Production UI Execution Law** (owner ruling 2026-08-11,
[`../ui/MASTER.md`](../ui/MASTER.md) §1.1): proactive design judgment inside
the locked tokens/kit/COPY laws, asynchronous owner review of the live
surface. The prior synchronous gates ("ASCII mock first, wait for yes" · the
localhost "Layout Approved" hold) were overwritten in their own governing
files in the same PR — MASTER OVERWRITE LAW, no new document. *(The ruling
arrived in-session; a referenced commit `6084aeba` does not exist in this
repository, and that is recorded rather than cited.)*

**What shipped — `OperationWork.tsx` (`/operation?tab=work`, sidebar `Work`
directly under Sales Orders):**

```
TWO FILTERS, ONE SET   My Work · Team Work over the SAME composed items —
                       never two datasets, never another dashboard. §2.2's
                       starting-view law verbatim: a non-manager lands on
                       My Work, a manager on Team Work, both can switch.
WHAT is open           the same openActionsOf the Orders list runs — one
                       signal mapping, two surfaces that cannot disagree
                       (the Delivery page's own assembly law, applied again).
WHO + WHEN             Card 9's workItemsForOrder: the PIC's name · each
                       key's ONE shipped clock · groupWorkItemsByDay (days
                       ascend · broken first · `No date` last).
THE ROW                the party-named orderActionLine (identical words to
                       the Orders row), SO ref + customer, the 🔒 on held
                       money, owner name in Team view, `{n} working days
                       late` against a due that never moves.
WRITES NOTHING         no Done button exists structurally; a row is a DOOR to
                       the Sales Order Workspace. Human follow-ups stay
                       ops_tasks and are not on this page.
WORDS                  COPY-STANDARD gained "The Work module words" — Work ·
                       My Work · Team Work · No date · the clear sentence —
                       cited to the 2026-08-11 ruling.
```

**Evidence:** five page tests (starting-view law by role · one-set/two-filters
with owner scoping · weekday+date grouping — never a bare Today · the row is
a door (navigate spy) · the quiet clear sentence) + the Card 9 engine's 11.
Full web build + design guard pass. shared 2274 · web 2717 passed (the 10
web failures on this machine are a pre-existing Windows path-separator
artifact in the file-scan tests — `\` vs `/` — my files appear in none of
their caller lists). Deploy + bundle verification below.

**Asynchronous review owed:** this surface is live for Jess/Loo to review in
production; their verdicts land as ordinary re-rulings on the next commit.

**Known boundaries, reported not hidden:**
- The set covers the ORDER track (the SO V2 programme's own scope). The
  purchasing / receiving / claims items keep their own surfaces and join
  this feed when their server feeds are wired — the Card 9 registry is the
  contract.
- `Completed` orders contribute exactly what their engines still hold open
  (the photo · money that survives delivery) — nothing else re-enters.

---

# SALES ORDER V2 — CURRENT APPROVED TARGET AND BUILD CHECKPOINT

> **OWNER RULING, 2026-08-11. This is current target truth under the MASTER OVERWRITE LAW.**
> It records the approved business destination, not a claim that every capability exists.
> Do not append an alternative blueprint beside it. When the owner changes a ruling, overwrite
> the obsolete rule here; Git is the history.

## Status — TARGET is not BUILT

| Card | Approved target | Built / verified |
|---|---|---|
| **1** | Customer Obligation Truth | **COMPLETE** — `dae94301`, migration `0340`, production verified 2026-08-11; exact implementation record immediately above |
| **2** | Unit / Stock Allocation Truth | **COMPLETE** — migration `0341`, production verified 2026-08-11 (nine rolled-back probes); exact implementation record above. The spine (unit birth at PO · receiving flips · governed draw) was measured ALREADY LIVE; the card closed the four violations of the approved law |
| **3** | Early Logistics Assignment + Customer Booking | **COMPLETE** — migrations `0342` + `0347`, production verified 2026-08-13 (six rolled-back probes); record above, which OVERWRITES the 2026-08-11 entry. 0342's ruled call window and lateness fix stand; the re-trace found the workspace hiding both early assignment and the T−3 call whenever the goods were not in, and built the booking brief the call needs |
| **4** | Money Truth + Collection Gate | **COMPLETE** — migrations `0343` + `0347`, production verified 2026-08-11 and re-verified 2026-08-13 (seven + nine rolled-back probes); record above. The gates and the one calculation were measured already live; the card converged the write (one payment writer, void as a stamp) and shipped the T−3/T−2/T−1 collection clock. **The 2026-08-13 closing slice taught every reader that a voided row is not money, retired the hand-keyed `payment_status` from the collections desk, made a receipt number unique, and gave money a trace on its own order** |
| **5** | Delivery Attempt + Delivery Exception | **COMPLETE** — migration `0344`, production verified 2026-08-11 (seven rolled-back probes); record above. The first genuine engine gap of the programme: attempt + exception stores built, units move through Card 2's doors in the same transaction |
| **6** | Loan Mattress / Loan Sofa Obligations | **COMPLETE** — no migration (Card 2 built the doors; Card 6 made the lane use them); production verified 2026-08-11; record above |
| **7** | Change / Cancel / Refund Lineage | **COMPLETE** — migration `0345` (the refund record), production verified 2026-08-11 (eight rolled-back probes); the rest of the lineage was measured already true; record above |
| **8** | Derived Completion — No Action Required | **COMPLETE** — code only (no migration): `resolveOrderCompletion` + `GET /:id/completion`, 2026-08-11; record above |
| **9** | Unified Work Engine | **COMPLETE** — shared code only: the five-part WORK_RULES registry + workItemsForOrder composition, 2026-08-11; record above |
| **10** | My Work / Team Work | **COMPLETE** — `OperationWork` (`?tab=work`), built under the Production UI Execution Law with asynchronous owner review owed; record above. 2026-08-11 |

Build truth before work. **Cards 2–10 are approved business rules, not permission to describe
their screens, schema, RPCs or production state as implemented.** Each card first traces the
existing read/write doors, reuses proven authority, then builds only its boundary and records
production proof here. A card must stop at its boundary; completing one does not authorise the
next.

## The three-system law

```
MODULES       = TRUTH
WORK          = ACTION
ISSUE TRACKER = ACCOUNTABILITY + MEMORY + LEARNING
```

- Sales Order, PO, Receiving, Unit, Delivery, Money and Loan preserve what is true.
- Work translates authoritative facts into **WHO + ACTION + OBJECT + WHEN (actual working
  weekday/date)**. It owns no
  duplicate transaction form or free-standing completion status.
- Issue Tracker records the incident, accountability, financial consequence, recovery and
  learning. It never substitutes for operational transaction truth.

## Card 1 · Customer Obligation Truth — approved and built

For every SO, answer: **What did the customer CURRENTLY commit to buy? How did it become this?**
Authority flows customer commitment → purchasing / fulfilment → PO → Unit → delivery, never
backwards from PO, stock, booking or a legacy delivered word.

```
Staff correction        the record was wrong; the customer agreement did not change
Customer change         the customer later requested a different commitment
Fulfilment replacement  the commitment stayed correct; an attempt to satisfy it failed
```

These are never collapsed. A fulfilment failure does not revise the SO. Physical fulfilled and
remaining quantity must not be guessed from `orders.status='delivered'`; authoritative fulfilment
waits for Card 2 Unit truth and Card 5 Delivery Attempt truth. The shipped implementation and
known door boundaries are preserved in the Card 1 record immediately above.

## Card 2 · Unit / Stock Allocation Truth — approved and built

The physical spine is:

```
PO placed → Unit ID born → supplier can label it → Receiving confirms arrival
→ Warehouse location / condition → system offers suitable stock → human decides
→ reserve to SO or keep purchasing demand → out for delivery → delivered / returned
```

Unit ID is born when the PO is placed, before receiving, and the same identity follows the
physical item through supplier labelling, Receiving, Warehouse, reservation, Delivery, return,
inspection and reuse. The register answers which real Unit exists, where it is, its condition,
which SO it is reserved for and the PO it came from.

**Ready Stock law:** the system may offer compatible existing warehouse stock; a human decides
whether to allocate it. Never silently auto-allocate or reallocate. A wrong, surplus, released or
customer-rejected Unit returns through location + inspection to **Available or Hold**; it does not
disappear with the old SO. The original SO continues to owe the correct commitment.

## Card 3 · Early Logistics Assignment + Customer Booking — approved and built

```
PO placed → assign logistics immediately → watch Stock ETA → contact customer early
→ Stock ETA + logistics capacity + customer preference → confirmed appointment
```

Do not wait for stock to be ready before assigning logistics. Keep three independent facts:
**assigned logistics** (who is responsible), **Stock ETA** (when goods are expected) and
**customer-confirmed date + slot** (what was actually agreed). Early visibility lets logistics
plan capacity while Operations knows the ETA. Booking begins as the delivery becomes credible;
the target call window is three actual working days before delivery, calculated with the
applicable working calendar and public holidays.

## Card 4 · Money Truth + Collection Gate — approved and built

Payment is recorded once, changes money truth once, and every reader derives the same answer.
Money is bilateral: customer → Carres outstanding, or Carres → customer refund.

```
delivery becomes real / Stock ETA usable
→ begin balance collection
→ T−3 and T−2 working-day attention
→ T−1 final deadline
→ unpaid: hold delivery and refuse DO
→ paid: delivery / DO gate may proceed
```

Use actual dates and the working calendar, not calendar-day subtraction. The T−1 deadline exists
because logistics commonly requests the DO the day before delivery. Delivered does not mean paid;
an unpaid delivered order remains open. The current split among `orders.paid`, `order_payments`,
`ops_order_control.balance`, `paid_amount` and `payment_status` must converge on one authoritative
write and calculation before any reader or gate claims completion.

## Card 5 · Delivery Attempt + Delivery Exception — approved and built

Every vehicle trip is a Delivery Attempt with a result. Success records the specific obligation
and Unit delivered. A non-completed attempt records one Delivery Exception and must answer:

```
1  What happened?
2  Where are the goods now?
3  What does Carres still owe the customer?
4  Who does what next?
```

The Unit must move with reality: Out for delivery → Delivered, or Returning → Warehouse received
→ Inspection → Available / Hold. A failure cannot leave the Unit falsely reserved or in transit.
Bed delivered while sofa remains is partial fulfilment, not a whole-order delivered conclusion.
Issue Tracker may record the same incident for accountability and learning, but cannot replace
the attempt, Unit movement or remaining customer obligation.

## Card 6 · Loan Mattress / Loan Sofa Obligations — approved and built

A temporary item is an independent obligation. The customer receiving real goods does not close
the loan; the temporary item must be recovered. Distinguish:

- **Carres stock loan:** identified Unit → customer → recovered → Warehouse inspection →
  Available / Hold.
- **Supplier loan:** identified temporary item → customer → recovered → returned to supplier →
  supplier return confirmed.

Customer recovery and supplier return are separate facts. The system may suggest considering a
loan when the real goods will miss the commitment; a human decides whether and which loan to use.
Once created, the obligation is structured, never inferred from notes or a free-text return date.
Final delivery should state both **deliver real Unit** and **recover loan Unit**; failure of the
second leaves Loan open even when Goods and Money are clear.

## Card 7 · Change / Cancel / Refund Lineage — approved and built

Preserve the complete chain: original customer order → governed revision / cancellation → every
fulfilment attempt and Unit consequence → replacement or released stock → financial consequence.
Never delete a historical PO, Unit or commercial commitment merely because the current SO changed.

A cancelled or changed goods obligation may become a money obligation. Goods no longer owed does
not mean the SO is clear: an approved but unpaid refund means **Carres still owes the customer**.
Structured actor, reason, approval and server time survive; Issue Tracker may hold the story but
is never required to make transaction lineage true.

## Card 8 · Derived Completion — approved and built

Do not create or press a new `completed` status. Derive completion:

```
Goods clear
+ Money clear in both directions
+ Loan clear, including supplier return
+ every refund / replacement / collection / other explicit commitment clear
= No Action Required
```

**Delivered ≠ Complete. Cancelled ≠ Complete.** `Delivered` is a physical fulfilment fact;
`No Action Required` is the derived whole-SO result. If any track remains open, show that truth and
let Work derive the next action. Sales Orders lists truth; it does not become the work queue.

## Card 9 · Unified Work Engine — approved and built

Work reads module facts and produces one open work set. Every system rule must define exactly:
**Trigger · Owner · Action · Due rule · Completion fact**. If it cannot name an authoritative
completion fact, it does not enter the engine.

```
WHO + ACTION + OBJECT + WHEN (ACTUAL WORKING WEEKDAY/DATE)
```

Show a named person when the roster/PIC determines one; use a shared station such as Warehouse
only when the work genuinely belongs there. Deadlines come from approved business rules and the
applicable working calendar, including public holidays. Staff see weekday + date, never only
`Today`, `Tomorrow` or `T−2`. Late work remains on its original due date with working days late;
do not manufacture `follow up`, `check`, `monitor` or escalation duplicates.

System work is completed only when its owning module records the completion fact; there is no
Done button. A separate **Human follow-up** may exist when a person explicitly promises an action
whose completion has no structured business fact. It is labelled as human-created and may be
completed explicitly; it never becomes module truth.

## Card 10 · My Work / Team Work — approved target, not built

`My Work` and `Team Work` are two filters over the same open work set, never two datasets and
never another dashboard:

```
My Work    owner = current user
Team Work  all open work, filterable by actual owner
```

Rows are grouped by actual working date and state the owner, concrete verb, counterparty/amount
where relevant, and SO / PO / Unit context. Opening a row goes to the owning module's existing
workspace: PO work → Purchasing; Receiving → Receiving; Unit → Warehouse; customer commitment →
Sales Order; collection/refund → Money; loan → its obligation surface. Work never copies those
forms. Team Work makes responsibility visible without reducing people to KPI cards; My Work tells
one operator exactly what to do.

## Issue Tracker · accountability and cost-recovery boundary — approved target, not built here

Issue Tracker preserves **incident + accountability + financial consequence + recovery +
learning**. Never collapse these identities into one `Owner`:

| Identity | Question |
|---|---|
| **Fault Owner** | Who or which party caused it? |
| **Action Owner** | Who must solve it now? |
| **Cost Bearer** | Who should ultimately pay? |
| **Service Provider** | Who actually performed the extra work? |

If NETS performs an RM80 extra trip caused by a supplier, preserve two transactions: Carres owes
NETS RM80 incurred cost; the supplier owes Carres RM80 recoverable. **Never net them off.** Track
cost incurred, amount recoverable and amount recovered separately, including dates and links to
the originating incident and financial records.

The tracker must remain exportable/analyzable by supplier / logistics / internal / other fault,
exact fault owner, action owner, cost bearer, service provider, issue type, incurred cost,
recoverable amount and recovered amount. Internal staff mistakes are named, not hidden. Repeated
cases become Wednesday-meeting evidence, training and eventually SOP. SO / PO / Unit / Delivery /
Payment remain the authority for what operationally happened.

## Restart / read order — the next chat starts here

1. Read root `CLAUDE.md` / `AGENTS.md` for the Constitution and MASTER OVERWRITE LAW.
2. Read [`../ERP-ARCHITECTURE.md`](../ERP-ARCHITECTURE.md) for cross-module ownership.
3. Read this section and the Card 1–10 shipped records immediately above it.
4. **ALL TEN CARDS ARE COMPLETE.** What remains of Sales Order V2 is not a card — it is the
   owed follow-through, in this order: ① Jess/Loo's ASYNCHRONOUS REVIEW of the Card 10 Work
   surface (§1.1 of the UI MASTER — verdicts land as ordinary re-rulings) · ② wiring the
   purchasing / receiving / claims feeds into the one composed work set (the Card 9 registry is
   the contract) · ③ the deferred items each card's own record names (supplier labelling
   surface · loan-claim atomicity · the proceeded-cancel approval lane · refunds on the desk ·
   the Settings working calendar).
5. **Do not invent Card 11 or later. Do not stop planning either.** A fresh Sales Orders/Register
   Plan/Design chat does not resume from the last local question. Apply the Constitution's
   OWNER-APPROVED OBJECT / DOMAIN ARCHITECTURE COMPLETENESS LAW and `../ui/MASTER.md` §1.2
   automatically: cover the whole relevant Sales Order lifecycle; object-level function-mine
   2990 (including `SO Maintenance`), AutoCount and useful mature/international ERP references;
   maintain one reference-to-Carres capability matrix; and trace consequences through PO/Supplier,
   Receiving, Stock/Unit, Delivery/DO, Payment/Finance, Claims, Issue Tracker, Work, permissions,
   audit and versioned customer documents. Maintain an explicitly **PROPOSED**, unnumbered roadmap
   and dependency order. Call a decision **NEXT** only after the pass explains why it is next.
   Approved Sales Order truth is baseline, never a question for Jess to approve again. Jess does
   not supply the research list. This Plan restart licenses no Sales Order/Register/UI/application
   code; continuous build remains governed separately.
6. Re-measure current code and production before quoting implementation state. Preserve unrelated
   dirty work. Do not reopen the approved business flow merely from preference; raise only a real
   repo/production contradiction or implementation impossibility.
7. **Do not start new architecture from this section.** The next structural work (Issue
   Tracker's four identities · the cross-module work feeds) gets its own owner-approved card
   first.

---

# §1 · Overview

**One table. One row = one customer order.** Every order in the business lands here; a click
opens the drawer, which has full control.

## 1.1 · MEASURED REALITY — 2026-08-06, and this is the baseline

> **How it was measured.** `packages/shared/src/order-actions.ts` (496) · `order-money.ts` (145)
> · `order-action-due.ts` (169) · `order-action-checklist.ts` (168) · `storage-hold.ts` (124)
> **read end to end.** `OperationOrdersControl.tsx` (5,121) — **all logic read end to end**
> (lines 1–2740: stage derivation, readiness, money, the ladder mapping, every facet, every
> bulk action); the JSX render was read structurally (rail groups, column defs, cell order).
> `OrderDetailDrawer.tsx` (7,717) — **read structurally, not line by line**: its tab union, all
> 44 panel titles, its two-column shell, every hook and every endpoint it writes. Database
> figures are live SQL.

```
orders                65      live (not AutoCount)      28
ops_order_control     65      with a PIC                65    ← the assignment sweep works

booking confirmed      0      delay_decision             0     delivery_photos    0
do_number              0      delivered                  0     order_payments     0
storage_from           0      balance keyed              0     line_etas          3
open ops_tasks         1
```

> ### 🔴 THE HEADLINE: **everything after "assign logistics" has never run.**
> Zero confirmed bookings · zero delivery orders · zero deliveries · zero photos · zero
> payments through the ledger · zero storage · zero delay decisions. **Roughly half of this
> module is shipped, tested and unexercised.** Every rule below about booking, the DO, the
> delivery day, the photo, storage and the delay clocks is proved by tests and by rolled-back
> transactions — **not by one real order having been through it.**

**Of the 28 live orders:** 22 carry a promised date · 1 is past it · 14 have a logistics
company · 18 have taken some money · 25 are priced · **19 are covered by a real purchase
order** · **0 carry `order_lines.source_po`.** That last pair is §5.1 — **the defect it caused was FIXED by D1 on 2026-08-06**, and the numbers are kept because they are what the fix was measured against.

**There is no single overall Order Status, and there never will be.** Business facts, actions,
module stages and exceptions are stored independently — `booking_stage`, `line_received`,
`delivery_photos` each record their own thing — and the view is COMPUTED at read time. **No row
carries one word claiming to summarise it.**

**An order can have several open actions at once**, computed independently so one never hides
another. The row shows the highest-priority one plus `+N`; the drawer shows them all.

**Pages that re-cut these orders by another angle are VIEWS, not modules.** The Delivery page
has its own sidebar item because operators live there all day, but it owns no records and
raises no actions — it renders §7's actions through the same shared computation this list runs.
**The same action is never defined in two files.**

---

# §2 · Shared architecture

## 2.1 · The action engine — two layers

**Layer 1** computes THREE TRACKS independently — goods · delivery · money — one action each at
most. The rungs inside a track are states of the same question, not parallel work.
**Layer 2** picks which one leads, giving every key its own rank inside its priority rung so the
sort is TOTAL — two actions can never tie and flip between renders.

**A broken commitment jumps every rung**, modelled as a FLAG rather than a rank: broken is a
fact about the ORDER, not about the kind of action.

```
1  Broken commitment or today's run     Deliver today · Upload delivery photo
2  The customer must be told — THROUGH LOGISTICS, never by us
                                        Call {logistics} — arrange new delivery date
3  Goods are not secured                Call {supplier} — confirm ready date · Issue PO
4  Delivery preparation                 Assign logistics · Call {logistics} — confirm delivery
                                        date · Issue delivery order
5  Money                                Collect RM {amount} from {customer}
```

**Money shows last and it is not a demotion** — you do not chase payment for goods you cannot
deliver. It never disappears: always in the drawer list and the Owing filter.

**Every action carries TWO strings** — a party-free QUEUE word for the facet row, the filter
chip and the count (a queue holds many suppliers, so it cannot name one), and a party-named ROW
line for a single order. Both come from ONE module, `packages/shared/src/order-action-words.ts`,
so a queue and a row **structurally cannot spell one action two ways**.

**Every open action opens the steps that close it** (`order-action-checklist.ts`). Each step is
one of the portal's OWN actions, so it is worded by that action's BUTTON string; **the last step
is the action's own outcome and is never ticked**, so an open action can never show a fully
ticked list. **No checkbox, no tick, no writer** — the state is READ from the same signals the
ladder just read.

## 2.2 · Ownership — two different things, and NEITHER is stored on an action

**Task Owner** = the order's PIC. The PIC owns EVERY action of that order, so an action carries
no owner field. **Case Owner** = the one person responsible for this customer's case start to
finish; it never changes and is never repeated on an action.

**How the PIC is decided** (LIVE, migrations 0232 + 0235;
`ops_order_control.assigned_staff / assigned_by / assigned_at` + `ops_staff_settings`):

- **One order, one owner, decided when the order arrives.** The system never moves an order off
  a person mid-flight on its own.
- **Opening an account is joining; disabling it is leaving.** An operation account joins the
  pool on its FIRST login and is dealt a share on that same page load. A generic, non-person
  account never joins. **Managers are never dealt orders.**
- **OWNER SCOPE — ruled by Jess 2026-08-07, and it replaces the two sentences that used to sit
  here and in §3 saying opposite-sounding things.**
  ```
  Sales Order is a SHARED REGISTER: every authorised operator may view and open
  every order.

  On first load a NON-MANAGER defaults to My Orders.
  A MANAGER defaults to Everyone.

  The owner filter is a STARTING VIEW, never an access restriction.
  The operator may switch to Everyone at any time.
  ```
  **The PIC says who is answerable, not who is allowed.** The old pair —
  *"no per-owner row filter"* beside *"a non-manager is defaulted to their own PIC filter"* —
  read as a contradiction and was not one; the missing word was **starting view**.
  Verified in code the same day: `OperationOrdersControl.tsx:2295-2307` defaults a non-manager
  to their own `staffFilter` once (ref-guarded, `if (isManager) return`), and the `TEAM` rail
  group renders for everyone — only `TeamPopover` (pool management) is manager-gated.
  **Nothing in code changes; this freezes what already ships.**
- **Only a manager may assign by hand** (`ops_manager`; the web hides the control, the API
  answers 403).
- **The sweep only re-spreads what the SYSTEM handed out.** Unowned orders and orders with
  `assigned_by` NULL are re-split evenly; **an order a human assigned never moves.** The split
  is deterministic, so two operators triggering it at once produce the same plan.
- **Absence needs no click.** A heartbeat is stamped while an operator has the portal open.
  **Before 10:00 MYT everybody keeps their share** — late is not absent. From 10:00 a member
  with no heartbeat counts as out and their system-assigned orders flow to whoever is in; they
  log in later and the share flows straight back.

## 2.3 · Row order

```
Primary    risk to the promise — overdue → due today → due next working day →
           commitment broken → stock will miss the window → action due soon → normal
Secondary  the customer's promised date
Tertiary   order value, high to low — a tie-breaker ONLY
```

**A large order weeks away never outranks a small one going out tomorrow.**

## 2.4 · The three dots

Three independent facts beside the stage pill. **Each dot carries its own icon** (goods
`package` · delivery `truck` · money `wallet`, 14px), so the dots need no header of their own;
the `Status` header belongs to the pill. **Never emoji, never a bare circle** — a colour nobody
can name without looking elsewhere is not a signal.

| | green | amber | red |
|---|---|---|---|
| goods | all in | waiting goods arrival | no PO raised, or the supplier's date is late against the deadline |
| delivery | the CUSTOMER confirmed | logistics gave a date, customer has not | past the deadline and still unconfirmed |
| money | settled | still owing, not late yet | still owing AND late — the balance due date passed, or the goods are delivered |

**A delivered order never alarms on goods or delivery. Delivered is not paid** — once the goods
are out, owing money is always RED: there is nothing left to wait for.

## 2.5 · What is deliberately NOT an action

- Anything a trigger already does by itself (a number the database stamps).
- Any step nobody records — *"goods loaded"*, *"driver departed"*.
- **Any tick-box that would only record "I say I did it."**
- **Waiting states are not actions.** Nobody does anything while one is true. A wait becomes an
  action when it EXPIRES or a human decision is required.
- **"Everything is ready, the day has not come" is not an action.** Goods in · logistics
  assigned · the date confirmed · that date still ahead — there is nothing for a human to do,
  which is why the old `Confirm delivery with {customer}` was the one drawer row **no button in
  the portal could close.** It is a quiet FACT — `Delivering 27 Jul · 9–11 AM` — and
  `Deliver today` takes over on the day.

## 2.6 · What the flow reads

| Signal | Where it lives |
|---|---|
| the customer's promised date | `orders.delivery_date` (+ `delivery_date_tbd`) |
| goods ordered / not | `purchase_orders` for this order |
| the supplier's ready date | `ops_order_control.line_etas` |
| goods physically in | `ops_stock_items` reserved to this order · `line_received` |
| logistics chosen | `orders.delivery_partners` / `ops_assigned_logistic` |
| the booking | `ops_order_control.booking_stage` + `confirmed_date` + `confirmed_time_slot` |
| delivery photos | `ops_order_control.delivery_photos` |
| the building we deliver to | `orders.entry_data → fields.building_type` — **it decides half-day vs full-day** |
| money | **`orders.paid`** — the one money truth. Shared rule: `packages/shared/src/order-money.ts` |

---

# §3 · The Orders list

### MISSION
One daily-driver table where every order lands, ordered by risk to the customer's promise.

### WORKFLOW
Six stage tabs map the Master Sheet's logistics-remark flow onto the live pipeline. **`Pending`
is a banned word** (pending on WHAT?) and **a date logistics proposed is not a booking**, which
is why the middle two are named as they are.

```
All · Placed · Proceed · To book · Customer confirmed · Delivered
```

- **Placed** — genuinely new, not yet triaged.
- **Proceed** — being arranged. **Includes AutoCount-imported orders** by the agreed entry rule
  (AutoCount import → Proceed; a future salesperson order → Placed).
- **To book** — past placement, goods and/or the customer's date still outstanding.
- **Customer confirmed** — stock in AND the customer confirmed a date + slot.
- **Delivered** · **All**.

### WHAT IS ON SCREEN TODAY
`apps/web/src/pages/operation/OperationOrdersControl.tsx`, **5,152 lines** ·
route **`/operation/old-orders`** since the cutover (§0.2) — it was `/operation/orders`
when this was measured · ***measured 2026-08-06 — every line of logic read end to end;
the JSX read structurally.*** It merges three legacy surfaces — the 6-column kanban, the
AutoCount triage Inbox and the flat read-only feed — into one table.

**The table itself is `kit/DataTable` since S1 (2026-08-07).** The page owns the columns, the
cells, the sort order and the 30-row window; the `<table>`, the `<tr>`, the widths, the 40px,
the sticky head, the select box and the column rules are the kit's. **Orders is no longer the
one register in the portal outside the kit.**

**The nine rail groups, in render order:** `QUEUES` (danger) · `DELIVERY` · `TEAM` ·
`DEADLINE` · `LOGISTICS` · `SUPPLIER` · `REGION` · `CATEGORY` · `FIX DATA`.
`FILTERS`, `FIX DATA` and `CATEGORY` start **collapsed**.

**QUEUES holds, in order:** `Overdue` · `Owing` (with the money total) · the four STOCK action
queues (`Issue PO` · `Confirm ready date` · `Delay planning` · `Arrange new delivery date`) ·
`Supplier late` · `Follow-up` · `For manager review`. **A row with a count of zero is not
rendered.** The two delay queues carry a `N · M late` tail from their own office-calendar
deadline; the other queues carry none.

**Every count runs over `liveScope`** = the current tab, minus completed, minus the AutoCount
archive. **`Owing` and the delivery-photo queue are the two deliberate exceptions** — both span
delivered orders, because the money and the proof outlive the delivery.

**The bulk bar writes:** assign logistics (loops the ops-assign endpoint) · create follow-up
tasks · mark completed (**server-scoped to AutoCount rows only**) · **No storage** (writes
`storage_fee_override = 0`) · CSV · Print.

**The auto-assign sweep is SERVER-SIDE and fires once per page load from ANY operation
session** — a staff member receives their share the moment THEY open the portal, with no
manager session. **The owner scope on first load is §2.2's OWNER SCOPE rule; it is stated
once, there.**

### DATE SCOPE — ruled by Jess 2026-08-07
```
No default date window.
`All` means every non-cancelled order the server returns.
NEVER default Sales Order to This Month.
```
**Sales Order is the REGISTER; SO Batch Purchase is the work queue and defaults to the current
purchasing window.** An order that is old AND still unpaid, undelivered or in service is
exactly the one a month window would hide, and it is the one that must not disappear quietly.
**AutoCount already separates these two uses and its own screens are the evidence** — its
`Sales Order` register loads all 1,567 with no filter chip; its `Sales Order Batch Posting`
opens on `Processing Date · Is this month · Record 31 of 31`
(`../research/grid-findings.md` F43 · F43a).

**How the page performs while showing everything is an ENGINEERING problem and may never
narrow this scope.** It is a gate on the build, not a reason to re-open the ruling.
**Verified unchanged in code:** `OperationOrdersControl.tsx:1561` defaults the tab to `all`,
`:1903-1906` returns `orders` unfiltered on that tab, and `liveScope` (`:1918`) narrows the
FACET COUNTS only, never the rows.

> 🟡 **The one gap this ruling exposes, reported not fixed.** The rule says *"the operator may
> switch to Everyone at any time"*, and today **`Everyone` is not a control with a name** — it
> is the cleared state, reached by clicking the ALREADY-ACTIVE `TEAM` row a second time
> (`OperationOrdersControl.tsx:2985`). Access is real; discoverability is not. **Whoever next
> touches the TEAM rail owes it a named row.**

```
FACET RAIL     QUEUES (the module's open actions, danger group first) ·
               DEADLINE (Overdue · Due ≤3d · This week · Next week) ·
               TEAM (per PIC) · LOGISTICS · CATEGORY · FIX DATA · Owing
TABLE          ☐ · Follow-up · Status(pill + 3 dots) · Order · Customer ·
               Deadline · Stock · Delivery · PIC · Actions(verb-led line + `+N`)
               rows 40px · default order = risk to the promise
FOOTER         the count band, and the `Loading more…` statement while the
               30-row window is short of the total
```

**Measured on production 2026-08-05 at 1440×900:** table 1012px in 951px available, 32 clipped
cells of 300 (all `Actions`, which needs 249px on every row and gets 208.5), 16 fully visible
rows. **The residual truncation is ACCEPTED** — the verb and the party are visible, the full
text is in the `title` and in the drawer. **`Actions` is still 208.5px after S1 and its
truncation is unchanged**; what S1 moved is below, measured the same way.

### ✅ S1 · SHIPPED 2026-08-07 — the list renders through `kit/DataTable`

**The migration is done and the card is closed.** `OperationOrdersControl.tsx` no longer
hand-writes a `<table>`: the eight business columns are `Column` objects, the header word is
typed once in the column def, and the `<tr>`, the widths, the 40px, the sticky head, the
select box, the row washes and the column rules are `kit/DataTable`'s. Same eight columns,
same data, same 30-row window, same risk order.

**WHAT WENT WITH THE HAND-WRITTEN TABLE**
```
carres.orders.hiddenCols  the localStorage store of column visibility.
                          Loo RULED against it 2026-08-04 (grid-findings F58 ·
                          F61) and the kit has nowhere to put it. The `⋮ Show
                          columns` popover and its `N/M` chip went with it —
                          the ⋮ held nothing else.
the <tr> sentinel         the append trigger moved onto the SCROLLER, through
                          `DataTable.rootRef`, at the same 240px threshold.
                          The `Loading more… (N of M)` statement moved to the
                          FOOTER count band — same words, beside the number it
                          qualifies.
the page's own <Th>       and its header hex, its colgroup and its wrapper
                          frame (P16: a list grid is a SHEET, not a card).
```
**Measured, not asserted:** the design guard's rule L — *"a browser-persisted UI-shape key in
`pages/**`"* — fell **8 → 6**. Rule G (*a hand-rolled table*) fell 682 → 678. No guard rule
rose.

**WHAT IS AVAILABLE BUT NOT WIRED, AND WHY.** Header-click sort and the per-column ▼ are one
prop away now, and S1 passes neither. `CLAUDE.md` §2: *"a feature is wired only if it makes the
operator finish faster today; 'the kit has it' is not an answer."* Sort needs the PAGE to
reorder rows against `compareBySlack` — the page's own answer to *what is most urgent* — and
what an operator should be allowed to sort away from that is a decision, not a prop. **It is
the next card's question and it is now cheap to answer.**
**→ S2.1 answered it on 2026-08-08 and sort is now wired; the ▼ is S2.2's.**

# ✅ S3 · SHIPPED 2026-08-08 — the width card, and it unblocked S2.5

> **Everything waited on this, and all of it is now paid.** S2.5 was blocked on it (measured,
> #692) and **shipped the same day S3.2 freed its 42px**; the ⚑ regression was it (`8340b0f0`);
> and `Actions` truncating on 30 of 30 rows had been marked ACCEPTED on an arithmetic this card
> overturned.

**⭐ THE DECISION, AND IT IS NOT A NEW ONE — IT IS TWO OF LOO'S OWN RULINGS, OPPOSED.**

```
Orders    2026-07-09  the table is ALWAYS exactly the container width, NEVER scrolls
                      sideways; long content ellipsis-truncates
To Order  2026-08-06  below its own width the grid SCROLLS SIDEWAYS, never truncates —
                      "deleting a business column, or shrinking one below its measured
                       content, to avoid a scrollbar is FORBIDDEN"
```

**One owner, two rulings, opposite directions, two pages — and the older one has now produced
the failure the newer one exists to forbid.** Measured on production at ~1130px: `Order` reads
`S(`, `Customer` reads `W. K.`, `Stock` reads one letter. **Every one of those is a column
shrunk below its measured content, which the 2026-08-06 ruling names and bans.**

> **S3 applies the LATER, MORE SPECIFIC ruling to Orders.** This is not a new law and not a
> reversal on the merits — it is the same owner's own rule, applied where its own stated
> failure has now appeared. **If Loo wants Orders to keep truncating instead, that is one
> sentence and S3 stops.**

```text
BUILD CARD · S3.   git pull, then read CLAUDE.md + docs/orders/MASTER.md §3.

S3.1 ✅ SHIPPED — Orders columns are CONTENT-SIZED — sizing="content", px widths
      measured in a real browser against each column's worst live string,
      exactly as To Order and Purchase Orders already are. Below the sum the
      grid scrolls sideways. It stops squeezing.
      ⚠ MEASURE AT ≤1130px. Every earlier width reading in this programme ran
        at 1440x900, where the defect is invisible (8340b0f0).

S3.2 ✅ SHIPPED — FREED THE ⚑'s 72px. It holds a 15px flag; it costs 72 because its HEADER
      needs the word. That needs `Column.label` to stop being `string` —
      A KIT CHANGE, reaching three FROZEN pages, so it is OPTIONAL and
      additive or it does not ship. If the kit refuses, S3.2 STOPS and reports;
      S3.1 stands on its own.

S3.3 ✅ SHIPPED — RE-OPENED `Actions`. §3 marks its 30-of-30 truncation ACCEPTED on the
      premise that all eight columns must be visible at once. S3.1 removes
      that premise. Re-measure and state whether ACCEPTED still holds.

DO NOT TOUCH   queues · business rules · the action ladder · the drawer ·
               permissions · api · row height · row ORDER (§2.3 is frozen,
               and S2.4 was refused on it).

THEN  test → self-review → PR → merge → deploy → verify production.
```

### ✅ S3.1 · SHIPPED 2026-08-08 — the columns stop being a share of the window

**Every column is now a MEASURED PIXEL and the grid scrolls below their sum.** The eight
business columns, the ⚑ and the kit's select box total **1,198px**; below that the kit's own box
scrolls sideways, and above it the slack goes to the kit's filler — **no column grows and none
shrinks.**

**THE MECHANISM WAS THE DEFECT.** A percentage makes a column's width a function of the WINDOW
instead of its CONTENT, so a narrow window silently spends C14's measurements down to nothing.
That is `Order` reading `S(`. `sizing="content"` + px widths ends it, and
`REFERENCE_TABLE_PX` · `GUTTER_DEFICIT_PCT` · `DEFICIT_SHARE` are **deleted** — all three
existed to answer *which business column pays for the gutters*, and the later ruling says
nobody does.

### ⭐ C14's METHOD WAS RIGHT AND THREE OF ITS NUMBERS WERE SHORT — ONE CAUSE

Re-measured in Chromium in each cell's **real markup**, 2026-08-08:

```
column     C14   S3.1   the measured cell                              why it moved
Status     133 → 139    pill + gap + three 14px dots      = 122.3      padding
Order       74 →  87    `CR0925 +2` mono 13/600           =  70.2      + string
Customer   185 → 189    `MyHouse Management PLT`          = 172.5      padding
Deadline   147 → 154    heat badge + gap + `Wed, 22 Jul 26` = 137.9    padding
Stock       50 →  54    `ETA —`                           =  37.6      padding
Delivery   147 → 160    `logistics said Mon, 20 Jul`      = 143.9      + string
PIC         58 →  58    the chip 24; header + arrow 34                 unchanged
Actions    207 → 253    verb line + `+N`                  = 236.2      + string
```

**Every width is `measured cell + 16px`, and 16 is the cause.** C14 budgeted 8–12px of cell
padding; **the kit's uniform `px-2` is 16.** S1 already recorded that four-pixel loss —
*"the kit's uniform `px-2` costs every column 4px of content box"* — and S3.1 is where it is
finally paid rather than absorbed. Two strings also simply measured wider than C14's note
(`CR0925 +2` is 70.2, not 65; `logistics said Mon, 20 Jul` is 143.9, not 135).

### MEASURED, NOT ASSERTED — AT FOUR WIDTHS INCLUDING LOO'S OWN

```
table container   1400    1022    890 (~1130px window)    850
table width       1398    1198    1198                    1198
scrolls?           no     YES     YES                     YES
columns off their declared px          NONE at any width
CELLS CLIPPED                          ZERO at any width
header row                             40px, no wrap, at every width
```

At 1400 the FILLER takes the slack — the columns stay exactly their measured pixels instead of
inflating, which is the half of `sizing="content"` that makes a measurement mean something on a
1920 monitor as well as a 1280 laptop.

> ✅ **AND IT CLOSES S2.1's REPORTED 🟡 FOR FREE.** `Stock` at 54px now holds its own sort
> arrow: S2.1 measured the arrow needing 46px against a 37.9px content box and being painted
> over by `Delivery`'s header. Nothing was done about it — the column simply stopped being
> squeezed.

### ✅ S3.2 · SHIPPED 2026-08-08 — the flag column costs 30px, and the kit did not refuse

**72px → 30px. 42px back to the eight business columns, and the word did not move.**

The cell was always ONE 15px flag. It cost 72 because `Column.label` is a `string`, so the head
had to SPELL it — `Follow-up` is 52.4px + the kit's 16. `8340b0f0` is what that bought: on a
~1130px window this column kept its 72 while `Order` collapsed to `S(`. **The column that
survived was the one answering nothing.**

### THE KIT DID NOT REFUSE, BECAUSE IT WAS NOT ASKED TO CHANGE A SIGNATURE

Widening `label` to `ReactNode` was the obvious fix and it is impossible — it reaches three
FROZEN pages. **`Column.headerContent?: ReactNode` is OPTIONAL and additive**, which is the same
door S1 used for `selection.rowLabel`: *"a changed signature reaches a frozen page; a new
optional prop cannot."*

**The word is not lost, and §10.1 is why it may not be.** `label` stays required, stays the
column's NAME, and is still the accessible name and the `title`. **Measured: the header's
accessible name reads `Follow-up` before AND after.** A screen reader and a hover get exactly
what they got; only the pixels changed. A kit test asserts both halves — that a caller passing
nothing emits **byte-identical markup**, and that a drawn header still answers to its name.

```
                        before            after
th width                72px              30px
content box             56.0              14.0
header needs            52.4 (the WORD)   14.0 (the drawn flag)
wraps?                  no                no
accessible name         Follow-up         Follow-up
table width             1198px            1156px
```

> ### ⭐ AND THE 42px IS EXACTLY WHAT S2.5 COSTS — TO THE PIXEL
>
> #692 measured the expansion chevron at 3% of a percentage-sized table. **Orders is
> `sizing="content"` since S3.1, and at content sizing the kit fixes that gutter at a flat
> `42px`** (`expansion && <col style={{ width: fills ? "42px" : "3%" }} />`). S3.2 freed
> **42px.** The gutter is paid for and not one business column pays anything.
>
> **S2.5 is unblocked.**

### ✅ S3.3 · SHIPPED 2026-08-08 — ACCEPTED does not hold, and C14's string was the wrong one

**`Actions` is 331px. The verdict §3 recorded is overturned — but not by re-running C14's
measurement. By finding that C14 measured the wrong string.**

Measured 2026-08-08, the `+N` chip included, + the kit's `px-2`:

```
Collect RM 1,234,567.00 from MyHouse Management PLT   397.9   UNBOUNDED
Call Nice Future Bedding — confirm ready date         330.1   ← the widest BOUNDED
Call HOUZS — arrange new delivery date                293.4
Collect RM 2,250.00 from Tan Ah Kow                   275.8
Delivering Mon, 20 Jul · 12pm–3pm                     256.4
Check in from Nice Future Bedding                     255.1
Call NETS — confirm delivery date                     252.2   ← C14's, and every
Issue PO to Nice Future Bedding                       238.3     card sized to it
```

> **THE WIDTH IS A FUNCTION OF THE PARTY, NOT OF THE TEMPLATE** — and C14 measured on a day
> whose live party was `NETS`, four characters. **Seven of the eleven reachable lines are wider
> than the 253 S3.1 derived from it**, and C14's own string is nearly the NARROWEST of the
> party-named family. The "widest LIVE content" method is right for a column whose content is
> data; it is wrong for one whose content is COMPOSED from a template and a configuration list.

**331 HOLDS EVERY BOUNDED LINE WHOLE.** Logistics companies and suppliers are CONFIGURATION
(`CLAUDE.md` §6 — *"what must survive is configuration: suppliers, SKUs, production days,
rates"*): a short, known, slow-changing list. Every action naming one of them now fits.

**THE ONE THAT STILL TRUNCATES IS `Collect … from {customer}`, and it is the right one to
accept.** A customer name is UNBOUNDED, so **no number retires this** — and it is the only
action line whose information is fully repeated on the same row: the customer is two columns
left, and the money is in S2.3's footer total and the `Owing` rail. Every other line names a
party that appears nowhere else on the row.

**So ACCEPTED is replaced, not renewed.** It used to mean *"every row truncates and we cannot
afford otherwise"*; it now means *"one action line truncates when one customer's name is long,
and its content is on the row twice already."*

**WHAT THIS UNBLOCKED — and S2.5 spent it the same day.** #692 measured the expansion chevron at
3% — **−24 to −28px taken from the eight business columns, `Actions` worst.** At `sizing="content"`
that gutter is a flat 42px instead, and S3.2 freed exactly 42. **S2.5 shipped on it, and every
one of the eight widths below is unchanged** — re-measured in Chromium at 1130px with the gutter
present (§3 · S2.5).

---

### 🔴 S1 REGRESSION, SEEN BY LOO ON A NARROW WINDOW 2026-08-08 — `Follow-up` NO LONGER SHRINKS

**Observed on production, not measured in a harness, and that is the point.** On a ~1130px
window the eight business columns collapse to a few characters each — `Order` reads `S(`,
`Customer` reads `W. K.`, `Stock` reads one letter — **while `Follow-up`, which holds one flag
icon, is among the widest columns on the sheet.**

```
BEFORE S1   ⚑ was 3% — a SHARE. It shrank with everything else.
AFTER  S1   ⚑ is 72px — FIXED. It keeps its space while the data loses theirs.
            (S1 had to: `Column.label` is a string, so the icon became the word
            `Follow-up`, and at a percentage it wrapped to `Follow-` / `up`.)

→ the narrower the window, the LARGER the share one flag icon takes.
  At a ~550px table that is ~13% for the flag plus 4% for the checkbox:
  a sixth of the sheet is control columns.
```

**Why no measurement caught it:** every width reading in `../research/grid-findings.md` §4.7
and every S1/S2.1 harness ran at 1440×900 or wider, where the loss is invisible. **The defect
only exists below the measured window, so an operator's eye found what the instrument could
not.** Re-measure at ≤1130px before claiming any width is safe.

**NOT FIXED HERE, and it is not S2's.** S2 wires grid powers and changes no width. This is the
first line of the width card (S3), and it joins the same defect family already measured in
Purchasing: `../research/grid-findings.md` §4.8 F71–F73 — three width mechanisms, two
scrollbars, and on four of six tabs **the column that falls off the edge is the one answering
the tab's own question.** Here the column that survives is the one answering nothing.

**🟡 SEEN IN THE SAME PASS, in the drawer, which every current card names DO NOT TOUCH:** the
items table's `PO` and `ITEM` headers render on top of each other (`PIOEM`). Recorded so it is
not lost; it belongs to whoever next opens §4.

### ⚠ THE WIDTH BUDGET MOVED, AND THE CARD'S "SAME WIDTHS" COULD NOT HOLD

The card said *same widths*. **It is arithmetically unsatisfiable and the build measured why**,
so the record is here rather than in a chat:

```
kit/DataTable OWNS the select column at a FIXED 4%   (the page spent 3%)
`Column.label` is a `string`, so ⚑ takes a WORD.
   `Follow-up` measures 54.4px at the th's text-label + the kit's px-2
   → the column is 72px, IN PIXELS                   (the page spent 3%)
────────────────────────────────────────────────────────────────────────
at C14's 1012px reference that is 7.11%, so the two control columns
cost 11.11% where they cost 6%
→ 5.11% MUST come out of the eight.  The only question is WHICH.
```

> ### ⛔ AND THE ⚑ COLUMN IS SIZED IN PIXELS, WHICH ONLY A REAL BROWSER COULD TELL US
>
> **S1 first shipped that column as a percentage — 7.25%, tuned to the 1012px table C14
> measured — and the header WRAPPED the first time the page was opened in Chromium.** At
> 1440×900 with the nav EXPANDED the table is **850px**, and 7.25% of that is 61.6px against a
> word that needs 70.4px. `Follow-up` rendered as "Follow-" over "up".
>
> **All 155 unit tests passed while it wrapped, and they always would have: jsdom has no
> layout engine.** A percentage of a table that changes width cannot protect a word whose width
> is fixed — only a pixel can. The kit already documents the recipe (`Column.width`: *"a string
> = raw CSS width — fixed interior columns … the international recipe"*).
>
> **The rule this leaves behind: a column whose HEADER is the widest thing it will ever hold is
> sized in pixels, not percent.** The unit test now pins `72px` and says why — it cannot catch
> the wrap, it can only hold the pixel that prevents it.
>
> **Measured in Chromium after the fix, both nav states, live dev server:**
> ```
> nav EXPANDED   table  850px   ⚑ 72px, one line   no sideways scroll
> nav COLLAPSED  table 1022px   ⚑ 72px, one line   no sideways scroll
>                Status 134.9 · Order 75.5 · Deadline 151.1 · Stock 54.0 ·
>                PIC 59.4 · Actions 210.5   ← every one of C14's, to the pixel
>                Customer 106.7 · Delivery 116.3   ← the two that pay
> ```
**Answered by measuring in Chromium at the real 1012px, on C14's own worst-case strings,
before and after in the same harness.** Two allocations were built and rejected first:

```
ALL ON `customer`, per C14's own deficit rule   →  123px → 77px,
    and `Tan Ah Kow` truncates.  REJECTED — an ordinary human name is
    not an edge case, and a rule written to absorb 50px does not
    survive being asked for 95px.
EVEN SPLIT customer + delivery                  →  `Tan Ah Kow` still
    loses 5px.  REJECTED — a symmetrical number is not an argument.
1 / 2 · `delivery` pays TWICE `customer`        →  SHIPPED
    customer 123 → 105px  ·  delivery 150 → 114px
    Actions · Deadline · Status · Order · Stock · PIC keep C14's
    width TO THE DIGIT, and the budget still lands on the whole table.
```
**`delivery` pays the larger share because it carries the least, and this module already ruled
why:** §3's frozen rule is that *"the `Delivery` cell never repeats the sentence `Actions`
already carries"* — the row says what to DO about missing logistics one column to the right,
every time — and C14 records this column's live exposure to its sizing string as **zero of 65
orders**. A customer's name is read on every row and nothing else on the row says it.

**C14's reason for not squeezing `delivery` was a hazard the kit REMOVES** — *"neither date
line carries `truncate`, so under-sizing this column does not ellipsise, it OVERFLOWS into
PIC."* The kit clips every cell, so nothing can bleed into PIC; all three of that cell's lines
now carry `truncate` + a `title`, so the clip shows an ellipsis instead of half a glyph.

**AND THE KIT'S UNIFORM `px-2` COSTS EVERY COLUMN 4px OF CONTENT BOX.** The page's cells padded
8–12px each. Measured deltas, same strings, before → after:
```
Actions   −135 / −78 / −78  →  IDENTICAL.  The column is 208.5px in both.
Status    −19 → −24   Order −34 → −43   Deadline −8/−5/−18 → −12/−9/−22
Stock       0 → −2    (`ETA —`, and it ellipsises)
Customer  −85 → −108  (the deficit; the name is in the title + drawer + search)
```
**Every one of those cells already truncated before S1** except `Stock`, and the MASTER already
marks the residual ACCEPTED. **`Actions` — the one thing on the row a human acts on — is
untouched**, which is what the card asked for and what was verified first.

> 🟡 **REPORTED, NOT FIXED — and the next card that re-tabulates this page starts here.**
>
> **① A 15px flag icon now occupies 73px, because its HEADER needs the word.** `Follow-up` is
> the widest thing that column will ever hold and it is in the HEAD, not the data — the cell is
> one tooltipped icon whose colour is the whole state. 7.25% is more than `Stock` (5.28) or
> `PIC` (5.81) get, on a table C14 measured **50px SHORT of its own content**. Either the kit
> learns an icon header (`Column.label` would have to stop being a `string`, which reaches
> three FROZEN pages) or the flag stops being a column. **S1 does not decide it** — the
> migration was approved with the word, and a build card does not reopen an approved rule.
>
> **② `Deadline` is clipped and deliberately has NO `truncate`.** S1 added one and took it back
> out: the ellipsis reserves its own width, so `Wed, 22 Jul 2` became `Wed, 22 Ju…` and the
> operator lost the MONTH to gain a signal they could already see. A date is read left to right
> and its tail is the year. **Re-measure before reaching for that again.**
>
> **③ `Actions` still truncates on every row**, exactly as before. The MASTER marks it ACCEPTED
> on an arithmetic that assumed all eight columns must be visible at once, and **a frozen
> identity gutter would change the assumption.** Still open, still not this card's.

### ONE KIT CHANGE, AND IT WAS A DEFECT REPAIR

Card 01 mapped 28 capabilities and found nothing missing. **It missed one, and the build
found it:** `selection` names the select-all box but had no word for a ROW's box — that name
was built from `rowId`. Orders keys its rows by the database uuid, as every write on the page
does, so the migration would have had a screen reader announce `Select 0f3a…` on all thirty
rows and would have LOST the operator's own name for the row.

`selection.rowLabel?: (row) => string` is now an optional prop, passed here as
`Select SO-1221`. **Optional is the kit's own rule for exactly this reason** — *"a changed
signature reaches a frozen page; a new optional prop cannot"* — and the three pages that pass
nothing emit byte-identical markup. **Card 01's verdict stands: zero ENGINE changes. This is a
missing word, and the kit's own §10.1 says a word is never the kit's to supply.**

# ▶︎ S2 · APPROVED TO BUILD 2026-08-08 — wire the powers S1 made reachable

> **S1 was INFRASTRUCTURE. It replaced the table renderer and deliberately wired nothing.**
> S2 is IMPLEMENTATION, not another research card. **Do NOT create a new Orders page** — keep
> amending `OperationOrdersControl.tsx`, which is where the business lives.

```text
BUILD CARD · S2 · connect the grid powers.   git pull first.
READ ONLY   CLAUDE.md  +  this §3.   Card 01 already returned READY.

ONE CAPABILITY PER COMMIT, IN THIS ORDER. Never one huge PR.
   S2.0  Make main GREEN         → ✅ SHIPPED 2026-08-08, recorded below
   S2.1  Header sorting          → ✅ SHIPPED 2026-08-08, recorded below
   S2.2  Header filter dropdowns → ✅ SHIPPED 2026-08-08, recorded below
   S2.3  Footer totals           → ✅ SHIPPED 2026-08-08, recorded below
   S2.4  Grouping                → ⛔ REFUSED 2026-08-08, recorded below
   S2.5  Expansion               → ✅ SHIPPED 2026-08-08, recorded below

S2 IS CLOSED. All five capabilities are answered — three wired, one refused,
one shipped once the width card paid for it.

COPY 2990's behaviour. Do NOT redesign any of them.
   2990s/apps/backend/src/components/DataGrid.tsx  (+ MfgSalesOrdersList.tsx)

DO NOT TOUCH   Queues · business rules · Actions · the drawer · permissions · API.
               Only rendering behaviour INSIDE the grid changes.
               Everything outside the grid stays OperationOrdersControl's.

IF A CAPABILITY CANNOT BE COPIED FROM 2990 — STOP AND REPORT.
Do not invent a replacement without approval.
```

**TWO CONFLICTS ARE ALREADY MEASURED. They are reported here so the build does not discover
them at the keyboard.**

**🔴 S2.3 · 2990 HAS NO FOOTER TOTALS. Nothing to copy.** Verified first-hand 2026-08-08:
`tfoot` · `totalRow` · `footerTotal` · `sumRow` return **two hits in 1,551 lines and both are
`totalRows`, a GROUP's row count** (`DataGrid.tsx:761-763`), not a totals strip. The source for
S2.3 is therefore **Carres' own kit** (`DataTable.totals`, D0.5d power 4) **and To Order's live
usage of it** — not 2990. **That is a source change, not an invention, so it needs no approval;
but the card may not claim it copied 2990.**

**🟡 S2.4 · GROUPING REORDERS ROWS, AND ROW ORDER IS FROZEN.** §2.3 rules the order is *risk to
the promise* — `compareBySlack` — and the kit emits a group header whenever the key CHANGES
from the row above, so **grouping and the frozen order cannot both hold.** Purchasing hit this
exact wall and its answer is on record (`../purchasing/MASTER.md` §3: re-cluster after every
sort so an order's items stay together). **Grouping an Orders row by anything is a BUSINESS
question — what an operator may be allowed to reorder away from risk — so S2.4 STOPS and asks
before it builds.**

> ### ⛔ S2.4 IS REFUSED, 2026-08-08 — and NO new ruling was needed to refuse it
>
> **§2.3 already answers this, and it is already frozen.** The card was right to stop; it was
> wrong that a decision was owed. Grouping is not a new question awaiting approval — it is a
> request to REVERSE a frozen rule, and **nobody has offered a reason to.**
>
> ```
> §3  MISSION      "ordered by risk to the customer's promise"
> §2.3 FROZEN      primary = risk · secondary = the promised date · tertiary = value
>                  "A large order weeks away never outranks a small one going out tomorrow."
>
> Grouping puts whatever sorts first at the top. The most urgent order sits
> wherever its group landed. That is the ONE thing this page exists to prevent.
> ```
>
> **AND THE PAGE ALREADY HAS WHAT GROUPING BUYS.** The facet rail is nine groups —
> `QUEUES · DELIVERY · TEAM · DEADLINE · LOGISTICS · SUPPLIER · REGION · CATEGORY · FIX DATA` —
> and a click filters to one. S2.2 added four header ▼ on top. **Grouping would be a tenth door
> onto facts that already have one, which is the duplication §3's own frozen rule bans.**
>
> **WHY 2990 HAS IT AND WE DO NOT — the standing rule, applied.** 2990's Sales Order list has
> **no facet rail and no action ladder** (§2 F22: *"no owner, queue or next-action concept
> anywhere in the 1,669 lines"*). It groups because grouping is the only way to find anything
> in a flat register. **We are not missing its power; we already solved the problem it solves,
> better. Copying it would be copying the ASSUMPTION.**
>
> **What would REOPEN it:** an operator observed doing a job the rail cannot do — needing every
> logistics company on screen AT ONCE rather than one at a time. **That is an observation of a
> person, not an argument about a grid**, and none exists. The owner may reopen §2.3 at any
> time; nothing here asks them to.
>
> **S2.4 is CLOSED. Go straight to S2.5 · Expansion.**

**SORTING'S DIVISION OF LABOUR DIFFERS AND THAT IS NOT A DEFECT.** 2990 sorts INSIDE its grid
(`sortedRows`, `col.sortFn`, `DataGrid.tsx:685-689`); Carres' kit states *"The PAGE sorts the
rows; the kit only shows the arrow."* **So S2.1 copies 2990's BEHAVIOUR — asc ⇄ desc ⇄ off —
into the page's own comparator, and does not move sorting into the kit.** The third click
already returns to `null`, which is `compareBySlack`, so §2.3 survives sorting by construction.

**THEN** test → self-review → PR → merge → deploy → verify production **per capability**.
**Do NOT come back for approval on engineering.** The four reasons to interrupt are the
Constitution's, and a truncated cell is not one of them.

### ✅ S2.0 · SHIPPED 2026-08-08 — main is GREEN, and the tests were the ones that were wrong

**231 files · 2,700 tests · 0 failures.** Was 16 failures across 4 suites, reproduced on a
clean `d0cede0c` checkout, so they predate S2 entirely. **Every one was a test asserting UI a
RULING had removed, and no component was touched** — `git status` on the whole card lists four
`.test.tsx` files and nothing else.

```
OperationOrders          7  the drawer's ActionBar buttons
OhanaSofaTab             4  "the Receive button is absent"
OrderCustomerCard        4  "the card has an Edit button"
NiceFutureMattressTab    1  "the row shows the supplier + warehouse"
```

**ONE RULING CAUSED NINE OF THE SIXTEEN.** Jess, 2026-07-11 — *every panel's actions live in
its header ⋮; the redundant inline button is gone.* The drawer's stage actions moved into the ⋮
(`OrderDetailDrawer.tsx:7266-7269`: *"the per-stage 'next step' lives in the ⋮ now — no sentence
row"*) and so did the customer card's Edit. **Test 15 in that same file had already followed the
move a card earlier; the stage tests never did**, which is exactly how a suite rots one ruling at
a time. The words moved with them: `Assign delivery partner` → **`Assign logistics`** ·
`Issue POs` → **`Issue PO`** · `Attach DO & mark delivered` → **`Mark delivered`** (from the
action dictionary, not spelled in the test) · `Transfer to ready (stock on-hand)` →
**`Transfer to ready`**. `Waiting for them to push it to operation` greps **0 times in `src`** —
the sentence row it belonged to was deleted, so that test was reading for a string, not a
behaviour.

**THE OTHER SEVEN WERE THREE MORE RULINGS.** Loo's **Direct-Receive escape hatch** (2026-05-11)
put a `Direct receive →` link on every non-terminal state, so *"the receive testid is absent"*
became false **and correct** — the receive RPC only requires `status='open'`, so operation can
legitimately receive whenever the DO arrives via the supplier. Loo's **row redesign C+D**
(2026-05-18) dropped the Supplier column (*"redundant per supplier tab"*) and the Warehouse
column (*"only 1 WH currently, zero info"*).

**NOTHING WAS DELETED TO GO GREEN — THE ASSERTIONS WERE INVERTED OR RE-AIMED.** A deleted
assertion lets the removed thing quietly come back; an inverted one fails the day it does and
names the ruling that would have to be reopened first. The three tests guarding real
`update_order` behaviour — PATCH only the changed field · a too-short name is refused · a no-op
Save just closes — were **kept exactly as written** and simply enter through the door that
exists (`startEditRef`, which IS the ⋮'s handle). **Three control cases were added** so the new
assertions cannot pass vacuously: a completed order offers no Abandon, a delivered partner does
offer the primary check-in, and the supplier name is asserted ABSENT rather than not-asserted.

> ### 🔴 AND THE CARD FOUND SOMETHING THAT IS NOT A TEST PROBLEM — **D9**
>
> Four of these tests could not reach the branch they named **no matter what stock the fixture
> declared**, and the reason is a live rule: `lineCategory()` reads `SOFA-NORD-3S` as an
> **accessory**, and §7 rules that accessories never block a delivery. So the line reported
> `1/1 ready` on **zero units**, `allReceived` went true, and the drawer's ladder answered
> `ready` — *goods secured* — for an order with no goods. **In a test that wasted a day; in
> production that is an order told it can be delivered.** Filed as **D9 🔴** with its live
> exposure named as the open question. **Not fixed by S2.0** — it reaches Stock and Purchasing,
> and that card's mandate was the tests. **It is fixed now; the two blocks below are the
> measurement and the build.**
>
> ### 🔴🔴 THE OPEN QUESTION IS ANSWERED. D9 IS LIVE, AND IT IS 1 IN 6 ORDERS.
> **Measured on production 2026-08-08** by replaying `lineCategory()`'s exact branches in SQL
> over every line of every non-cancelled order:
> ```
> live orders                                              77
> orders touching a MISREAD sku                            17
> orders whose EVERY line classifies as `acc`              12   ← 16% of the register
> misread lines                                            36
> ```
> **Those twelve orders can never fail a stock check.** Every line reads as an accessory, §7
> says an accessory never blocks delivery, so the ladder answers *goods secured* without ever
> asking the warehouse. **The build chat's guess that canonical SKUs are safe was right and
> beside the point — the damage is in the free-text ones, and they are the majority of the
> sofa book.**
>
> **What is being misread, verbatim from production:**
> ```
> SOFA MODULES read as accessories — 10 skus
>   5539-1A(LHF) · 5539-1B(LHF) · 5539-2A(RHF) · 5539-2B(LHF) · 5539-CNR ·
>   5539-L(RHF) · 5539-STOOL · LYYAR-1A(LHF) · LYYAR-1A(RHF) · TELLUC-1S
>   (LHF/RHF = left/right hand facing · CNR = corner. These are the SAME
>    strings Purchasing prints on live POs — PO-2031 carries `5539-2A(RHF)`.)
>
> MATTRESS-SHAPED read as accessories — 3 skus
>   M1201F-K · N1001S-Q · GRT-MATTRESS-15Y
>   `M1401F-K` IS classified mattress because the list holds `m140`.
>   `M1201F-K` is one digit away and falls through. One product family,
>   two answers.
> ```
> **THE CAUSE IS THE SHAPE OF THE RULE, NOT A MISSING ENTRY.** `lineCategory()` ends in
> `return "acc"` — an unknown SKU is silently declared an accessory, and an accessory is
> declared safe. **The default is the most dangerous of the four answers.** Adding `5539` and
> `lyyar` to the keyword list fixes today's twelve orders and rebuilds the trap for the next
> model Ohana names. **D9 had to decide what an UNRECOGNISED sku is allowed to claim** — and
> *"it does not block delivery"* could not be it. **It now claims nothing.**
>
> **Bounded honestly:** `CLAUDE.md` §6 rules every live row is TEST data, so 12/77 is evidence
> about the CODE, never about business volume. **It is not evidence about severity, which is
> the same at any volume.** Re-run the query at go-live.
>
> ## ✅ D9 · SHIPPED 2026-08-08 — an unrecognised SKU no longer claims it is safe to deliver
>
> **Live on `a7daf937`** — web bundle `index-CTbZKTLN.js` across all four canonicals, Worker
> version `fa58a642`. **The Worker was owed even though D9 changed no `apps/api` file**:
> `order-control.ts` imports `bookingConfirmGate`, and the gate's answer moved. Deploy proof in
> [`ENGINEERING.md`](../ENGINEERING.md) §9.
>
> **The headline number, re-measured before the build and again after it:**
> ```
>                                                    before      after
> live orders                                            77         77
> orders that could NEVER fail a stock check             20   →       0
> lines answering `acc` because nothing recognised them  45   →       0
> lines re-classified into anything OTHER than unknown         →      0
> ```
> **The last row is the one that says the fix is safe.** Not one line was promoted into a new
> category. Everything the rule already recognised answers exactly what it answered yesterday;
> the ONLY thing that changed is that a line nothing recognised stopped calling itself an
> accessory. The card's own 77 / 17 / 12 / 36 replicated to the digit — the counts were re-run,
> not inherited.
>
> ### THE FIX IS A SHAPE, NOT A KEYWORD
> `5539` and `lyyar` were deliberately **not** added. Adding them clears twelve orders and
> rebuilds the same trap for the next model Ohana names — and the classifier mirrors the
> server's `resolve_demand_category` (0148) verbatim, so a keyword may not move on one side
> alone. The defect was never a missing entry. It was **one word carrying two facts**: `acc`
> meant both *"this is an accessory"* and *"I do not recognise this"*, and §7 rules the first
> one safe.
>
> ```
> lineClass(sku)   mattress · bedframe · sofa · acc · UNKNOWN
>                  `acc` is now EARNED by an accessory word. Nothing reaches it
>                  by elimination. The fallthrough is `unknown`, which is
>                  §2.5's third state — it raises nothing and claims nothing.
> ```
>
> **Where the third state actually bites, because a type nobody reads is not a fix:**
> - `lineReadiness` — the `acc ⇒ always reserved` shortcut is now spent only on a RECOGNISED
>   accessory. `unknown` is checked **last**, so it yields to every piece of real evidence
>   (units reserved to the SO · free matching stock · an open PO) and only ever replaces the
>   bare guess. It is deliberately **not** `no_po` — *"nobody ordered it"* is a claim about a
>   thing you can name, and the action here is to say what the line is, not to raise a PO.
> - `bookingConfirmGate` — a groupless line used to be walked past, and an unrecognised line
>   WAS a groupless line. It now collects `unknownSkus`, `goodsReady` goes false while any
>   survive, and they are repeated into `notReadySkus` so the 422 an operator already reads
>   names them instead of going silent. **A fully-reserved bed set is held back by one
>   unplaceable line riding along**, and `splitAvailable` goes false — there is no honest
>   answer to *"which trip does this go on"* for a thing nobody can classify.
> - `importAccessoryKind` — an unrecognised SKU is no longer forecast as a container of pillows.
>
> **Three ownership facts kept the blast radius honest.** `deliveryGroupOf` still returns `null`
> for both a pillow and an unknown line, so `null` now means two different things — the module
> exports `isOutsideTheTrip` and `isUnknownGood` to tell them apart, and a bare `null` may never
> again be read as "harmless". `lineCategory` was NOT widened: two screens group their rows by
> it, and both are files this card was forbidden to touch, so it survives as a documented
> three-answer VIEW of `lineClass` that folds `unknown` into `acc`. Every SAFETY reader was moved
> to `lineClass`.
>
> **What that fold still costs, stated rather than hidden:** an unrecognised sofa module still
> prints under the `Accessory` header in the drawer and in the list's items chip. **The label is
> still wrong. The claim is not** — nothing reachable from that fold can call goods ready.
>
> ### 🟡 THE TWO FOLLOW-UPS THIS CARD REFUSED TO FAKE
> 1. **Delete `lineCategory`.** Move `OperationOrdersControl.tsx:1542` and the drawer's
>    `groupCatOf` (`OrderDetailDrawer.tsx:3506`) onto `lineClass`, give `unknown` its own header
>    and its own pill word. Today an unknown line renders `No PO` — true, but not the sentence
>    the operator needs. **Blocked only by file ownership, not by design.**
> 2. **Name the sixteen SKUs** — 10 Ohana sofa modules, 3 mattress-shaped, and the rest. This is
>    a Purchasing/Stock card, not an Orders one: the keyword list and migration 0148 must move
>    together, and until they do those lines correctly read `unknown` rather than incorrectly
>    reading safe. **`M1401F-K` classifies and `M1201F-K` does not — one product family, one
>    digit, two answers**, and that is the argument for a catalog lookup instead of a longer
>    regex.
>
> **PROPOSAL, NOT LAW — and its falsifier.** *An unrecognised good must block, while unknown
> MONEY does not* (§8: "unknown warns, never blocks"). The asymmetry is deliberate: unknown money
> is a number nobody entered, and holding a customer's goods over our own missing data entry
> punishes the customer for our gap. An unknown good is a physical object that has to be on the
> truck. **This is overturned the day an operator is blocked on a line that turns out to be a
> genuine accessory** — the observable event is an order stuck at `unknown` whose line, once
> named, classifies as `acc`. Follow-up 2 is what closes that, and `Leg 4"` (1 live line) is the
> candidate to watch.

### ✅ S2.1 · SHIPPED 2026-08-08 — the operator sorts, and the third click gives the risk order back

**Eight of the nine columns sort. The cycle is 2990's** — `asc ⇄ desc ⇄ OFF`, and **`OFF` is not
"no sort", it is `compareBySlack`**, so §2.3's frozen row order is one click away and is never
something an operator has to rebuild by hand. **The sort runs on `visible`, never on the 30
rendered rows** — sorting a window shuffles the rows already on screen and silently claims to
have ordered 65; a test pins it with the smallest value deliberately placed outside the window.

**The division of labour is Carres', not 2990's, and the card said so before the build.** 2990
sorts inside its grid; `kit/DataTable` rules *"the PAGE sorts the rows; the kit only shows the
arrow"*. So **2990's COMPARATOR** (`DataGrid.tsx:689-699` — numeric when both sides are numbers,
`localeCompare` otherwise, **blanks LAST in both directions**) lives in the page, one sort value
per column, and **nothing about sorting moved into the kit.** The default order is applied first
and `Array.prototype.sort` is stable, so **`compareBySlack` survives inside every tie.**

**THREE RULES, and every column obeys one:**
```
a WORD   sorts A → Z          Order · Customer · PIC · Actions
a STATE  sorts WORST FIRST    Status · Deadline · Stock · Delivery — so the FIRST
                              click never buries the work at the bottom
a BLANK  sorts LAST in BOTH directions — Excel's rule, and 2990 spells it too
                              (`(a || '~')`, `:682`). Without it, ascending
                              `Deadline` opens on every undated order there is.
```
**A rank is never typed twice:** the stage rank IS `TABS`, the stock rank IS `STOCK_BUCKETS`
(Law D — a derived fact has ONE arithmetic). **A TBD date sorts with the blanks**, because it is
no date, not a late one.

### ✅ S2.5 · SHIPPED 2026-08-08 — the expansion, and the label was a different column than the card thought

**The list can now answer *what did they buy* without losing itself.** The drawer *"renders IN
PLACE of the list, not as an overlay"*, and the Items column was removed from this table
entirely (`itemRollup` survives only in the CSV/print export) — so until this card there was
**no answer to R4 on this screen at all**. Expand is the one grid power that buys something the
drawer structurally cannot.

**IT COST NO BUSINESS COLUMN ANYTHING, AND THAT IS THE WHOLE REASON IT COULD RUN.** #692 blocked
it on a number: the chevron is a third gutter at **3%** of a percentage-sized table, −24 to −28px
taken off the eight business columns with `Actions` worst. S3.1 made every column a measured
PIXEL, where the kit fixes that gutter at a flat **42px**; S3.2 freed exactly **42px** off the ⚑.
**Measured in Chromium at 1130px — Loo's own regression width — after the change:**

```
expand      42.0    select    32.0    ⚑ Follow-up  30.0
Status     139.0    Order     87.0    Customer    189.0    Deadline  154.0
Stock       54.0    Delivery 160.0    PIC          58.0    Actions   331.0
                                              table 1276px in a 1130px viewport → scrolls
```

**Every business width is byte-identical to S3.3's.** The width test asserts the gutter and the
eight together, so the trade cannot be silently un-paid later.

### ⭐ THE OPEN ITEM: `variant` WAS THE WRONG COLUMN, AND `description` WAS ALREADY ON THE WIRE

**#692 flagged one thing to settle first — `order_lines` carries `{ sku, qty, unit_price }` with
no description, R4 requires *"human words, not codes"*, and it named the catalog's `variant` as
the human label. Measured on production, `variant` carries no human word at all.** It is a SIZE
or a MODULE CODE:

```
sku            variant     product_skus.description
B1201S-K       King        Mattress B1201S 183X190CM
CODY-Q         Queen       Bedframe Cody 152X190CM
5539-CNR       CNR         Sofa Booqit CNR
5539-2A(RHF)   2A(RHF)     Sofa Booqit 2A(RHF)
```

**`description` is the label.** 209/209 filled, equal to neither the sku nor `name + variant` on
any row, and the only field carrying R4's three parts at once — the noun (*what it is*), the
model, and the spec (*the physical size*). **This is S3.3's lesson a second time: the method was
right and the column was wrong.** C14 measured the wrong string; #692 named the wrong field.

**It cost no fetch, no route and no migration.** The API already generates it for bed sizes and
the catalog admin may type it (`catalog.ts:754`); it already rides `GET /api/catalog` through
`productSkuFromRow`; and this page **already** called `useCatalog()` for the SUPPLIER facet. The
whole change is three fields on a map that existed.

### THE FALLBACK IS A WHOLE POPULATION, NOT AN EDGE — AND IT IS NOT A DEGRADATION

**Measured 2026-08-08 over 184 live lines. The split is by SOURCE, not by chance:**

```
source        orders   lines   matched a catalog row
autocount         37      94     0      ← none. not "some".
native (POS)      32      82    81
rental             8       8     8
```

**Zero of 94.** A fallback that shrugged would blank half the list. It does not have to:
**the AutoCount "SKU" IS free text a human typed** — `Breeze FirmCare-B1201F-Q` · `Essential
Memory Pillow(L)` · `Mattress Disposal` · `No Lift Per Floor Charge` — and on that population it
is frequently MORE human than a catalog label would be. **So it is printed verbatim, and the
card's instruction *"do not invent a name"* is obeyed literally**: nothing is composed out of
`lineClass` + `lineSize` to dress a line the record cannot name. When nothing is known, the
string that IS there is what is shown.

> **FALSIFIER, and it already has one instance.** A NATIVE line whose sku has no catalog row
> prints a bare code with no human word in it. Live today: **1 of 82** — `M1201F-K`, and no
> `M1201F%` sku exists at all, so it is a deleted-catalog artefact of the trial data §6 throws
> away at go-live. **If a second appears from the POS path, the fallback stops being cosmetic
> and `order_lines` must store the description AT SALE** — a line should not be renamed by a
> later catalog edit anyway.

### WHAT WAS COPIED FROM 2990, AND THE THREE THINGS THAT WERE NOT

**The SHAPE is 2990's** — the expand is the record's line items, every caller, no exceptions
(`MfgSalesOrdersList.tsx:574`). Three of its parts were left behind, each for a stated reason:

| 2990 has | Carres does not | Why |
|---|---|---|
| `UNIT COST · LINE COST · MARGIN` | — | §4 **R5: never cost, never margin.** A test asserts no money word reaches the panel. |
| a fetch, with loading + error states | — | `order_lines` is already embedded in the list response the row was drawn from. **A state that cannot occur does not get a branch.** |
| a full grid — sort, group, resize, persisted layout | — | Measured: **77 orders hold 1–8 lines, median 2**; only 3 carry more than five. A configurable grid over two rows is furniture, and F61 forbids persisting a layout. |

**Nor does it carry stock, PO or GRN state.** R4 *"proves nothing"*; the row's own `Stock` and
`Actions` cells already answer that, and a second home for one fact is ownership Law C.

**No de-duplication and no rollup.** Two lines of the same SKU is what AutoCount booked (one live
order carries `Essential Memory Pillow(L)` twice) and merging them would show a record that does
not exist — so the panel keys by INDEX, not by sku. `itemTags` stays where it is: it answers
*what kind of goods* in one line for the CSV and **cannot** answer *which mattress*, which is the
question R4 opens on.

**The control's word is `Show items in SO-1221`** — the operator's own name for the row, the same
reason `selection.rowLabel` exists. `aria-expanded` carries open/closed, so the word never flips.
An order with no lines gets **no control at all**, which is the kit's own rule rather than a dead
chevron. Nothing is remembered across a remount (§0.4).

> 🟡 **FOUND IN PASSING, NOT FIXED HERE — the drawer's Items panel keys its rows by `l.sku`**
> (`OrderDetailDrawer.tsx:3327`), and a sku is NOT unique within an order. Two real lines collapse
> to one React child on exactly the live order above. **The drawer is DO-NOT-TOUCH for every S2
> card**, so it is recorded rather than taken; it is one word (`key={i}`) whenever a card owns
> that file.

### SALES ORDERS STATUS FOOTER — APPROVED / LOCKED (Loo, 2026-08-11)

Sales Orders uses the Register Template's one rendered 32px fixed status footer inside the table
frame. It combines orientation and the page-owned business summary in one sentence; there is no
second count strip. Its three states are:

```
RESTING    75 orders · RM 48,101.50 outstanding · 12 not priced
FILTERED   2 of 75 orders · RM 1,680.00 outstanding · 0 not priced
SELECTED   2 selected orders · RM 480.00 selected outstanding · 0 not priced
```

The figures are shapes, not fixture values. Resting and filtered money closes over the whole
current filtered list, never the virtualised/rendered window, so scrolling cannot change the
answer. Selected money closes over the selected Sales Orders. `orderMoney` unknown remains
`not priced`, never RM 0; the caveat stays explicit even when its count is zero. `fmtMoney`
remains the single currency formatter.

The footer is one line and does not wrap or own horizontal scroll. The table frame preserves the
Register Template's 8px bottom gap outside the footer. Rows remain consecutive while more results
exist; genuine empty data space appears only when the complete result set is shorter than the
viewport. The footer never contains Reset layout or any action.

### ✅ S2.2 · SHIPPED 2026-08-08 — the header ▼, on the four columns where it is a DOOR and not a second home

**FOUR columns filter from their header. Four deliberately do not, and that split is this
module's own frozen rule doing its job**, not a shortcut:

> **Nothing on the list says the same thing twice.** … `Overdue` has exactly ONE home
> (the QUEUES rail).

2990 puts a funnel on **every** column (`DataGrid.tsx:342-345`, Commander 2026-05-29 —
*"没有 drop-down 菜单让我去做选择"*), and the kit already renders the popover Jess approved on
2026-08-01. What could not be copied wholesale is WHICH columns, because **almost every column
here already has a rail facet.** So the test is not *does 2990 have a ▼* — it is **does this ▼
create a second FILTER, or a second DOOR onto the one that exists**:

```
order      no rail facet             →  the ▼ owns its own state      WIRED
customer   no rail facet             →  the ▼ owns its own state      WIRED
deadline   DEADLINE   Set<DueBucket> →  the ▼ WRITES THE RAIL'S SET   WIRED
delivery   LOGISTICS  Set<string>    →  the ▼ WRITES THE RAIL'S SET   WIRED
──────────────────────────────────────────────────────────────────────────
dots       the stage TABS own it     →  a THIRD home for the stage    NOT WIRED
stock      stockFilter  — SINGLE-select
pic        staffFilter  — SINGLE-select
next       nextFilter   — SINGLE-select                               NOT WIRED
```

**`Deadline` and `Delivery` do not keep a set of their own.** Ticking `Due ≤3d` in the header
is the same act as clicking it in the rail; clearing either clears both. **One truth, two
doors** — the architecture's Law C is about two RECORDS, not two surfaces onto one. A test
asserts it **in both directions**, which is the only way to tell that apart from two states
that merely agree today.

**THE CASCADE IS EXCEL'S, AND TO ORDER ALREADY SHIPPED IT.** Each ▼ lists the values that
survive every OTHER narrowing, so an option a menu offers is an option that can return a row.
**With one correction the rule needs:** a column's ▼ is computed with **its own filter LIFTED**.
Filter it by itself and ticking one value makes every other value vanish — no way back except
Clear. Pinned by its own test.

> ### ⛔ THE LAST THREE ARE A CARD BOUNDARY, NOT A JUDGEMENT
>
> `stockFilter` · `staffFilter` · `nextFilter` are `T | null` — clicking a second PIC in the
> rail REPLACES the first. The kit's ▼ is a multi-select checklist, so wiring it to those three
> means **widening them to sets, and that changes what the RAIL does.** The S2 card is explicit:
> *"DO NOT TOUCH Queues … Only rendering behaviour INSIDE the grid changes."* Widening a rail
> facet from single to multi-select is not rendering behaviour inside the grid — and three of
> the four are QUEUES rows by name.
>
> **Whether an operator may hold two PICs or two stock states at once is a real question with a
> real answer, and it belongs to the card that owns the rail** — not to a grid-wiring card that
> would answer it as a side effect.

**MEASURED IN CHROMIUM AT FOUR WIDTHS, and the fourth is there because of `8340b0f0`** — the
S1 regression Loo caught at ~1130px, whose lesson was *"re-measure at ≤1130px before calling any
width safe."* The ▼ button is **24px**. The header row stays **40px** and every label stays on
**one line** at all four:

```
table width   1022 (nav collapsed)   890 (~1130px viewport)   850 (nav expanded)   700
order            fits, 3.4 spare        +7.0 into padding      +10.2  ▼ 2px clipped   +22.2 ✂
customer         fits, 13.1 spare       +1.7 into padding      +6.2   fits inside     +23.0 ✂
deadline         fits, 62.6 spare       fits                   fits                   fits
delivery         fits, 30.8 spare       fits                   fits                   +8.6  ✂
```

**At the width Loo actually reported the ▼ fits** — the spill at 890px is into the `th`'s own
8px padding, not past its border. `Order` is the tightest column and the first that would lose
its ▼ if anything else joined the header.

> 🟡 **REPORTED, NOT FIXED — below ~800px the `Order` ▼ is clipped by its neighbour.** Same
> class as S2.1's `Stock` arrow: the label stays whole, the control is what gets overpainted.
> **It is not fixed here because the fix is a WIDTH**, and `8340b0f0` already rules widths out
> of S2 (*"S2 wires grid powers and changes no width"*). It joins that card's list.

### ⛔ ⚑ `Follow-up` DOES NOT SORT, AND ONLY A REAL BROWSER COULD SAY SO

**Measured in Chromium, both nav states, with the arrow actually in the DOM** — a sortable
header renders its chevron only on hover or once sorted, so measuring the resting header proves
nothing. The harness renders the real `kit/DataTable` at the two live table widths and
reproduces C14's columns to the digit at 1022px.

```
column      content box        label      verdict
            850 / 1022 px    + arrow
Follow-up    56.0   56.6       68.4     WRAPS "Follow-" / "up" — at BOTH widths
Stock        28.1   37.9       46.0     arrow 17.9 / 8.1 past the content box
PIC          32.5   43.3       34.0     0.2–1.6 over at 850, absorbed by the padding
Order        45.8   59.4       46.0     — and both stay on ONE line
Status · Customer · Deadline · Delivery · Actions   fit at both widths
```

**`Follow-up` is the one label on this table with a HYPHEN, and a hyphen is a break
opportunity** — which is why being over the content box is not on its own the test. `Stock`,
`PIC` and `Order` are all over it at 850px and every one stays on one line: a single word with
no break opportunity can only overflow. **S1 shipped that wrap once and pinned 72px to stop it;
sorting the column would hand back the pixel S1 paid for.** Nothing is lost — the QUEUES rail
already carries `Follow-up` and `For manager review` as FILTERS, and **a filter beats a sort for
*show me my flags*: it removes the other rows instead of stacking them underneath.**

> 🟡 **REPORTED, NOT FIXED — `Stock` loses its arrow at ONE of the two widths.** With the nav
> EXPANDED the arrow runs 9.9px past the column's border and `Delivery`'s header background
> paints over it; with the nav COLLAPSED it lands flush against the rule, tight but whole.
> **Kept sortable on purpose:** the rows visibly reorder and `aria-sort` is correct for a screen
> reader, and the alternative is losing worst-first stock ordering over 9 pixels at one window
> size. There is no cheap width to take them from — C14 sized every column to its CELLS.

**Measured, not asserted:** every design-guard rule is byte-identical to `d0cede0c` with and
without this change — **no guard rule rose.** `tsc` clean, `v4-guard` clean, the page's suite
**165 passing**.

> 🔴 **AND THE WEB SUITE WAS ALREADY RED BEFORE THIS CARD OPENED.** 16 failures across
> `OperationOrders.test.tsx` (7) · `OhanaSofaTab` (4) · `NiceFutureMattressTab` (1) ·
> `OrderCustomerCard` (4), **reproduced on a clean `d0cede0c` checkout — identical set, identical
> count.** They are stale tests asserting UI their components no longer render (`OrderCustomerCard`
> looks for an `Edit` button on a card that is now read-only rows, which may be §4's *"the right
> panel does not edit"* landing correctly and the test never following). **Not fixed here** —
> the S2 card names the drawer and business rules as DO NOT TOUCH, and deciding which side is
> out of date is a card, not a line. **A red suite on main means every future card starts unable
> to tell its own failures from the inherited ones.**

### API + DATA
`GET /api/operation/orders` is the single source of stage derivation — the control table is the
kanban-as-table, so stage logic lives in one place. `ops_order_control` carries the operational
columns. **Cancelled orders are excluded server-side**, so `All` means every LIVE order.

### FROZEN RULES
- **The AutoCount archive is excluded from WORK, never hidden from the record.** `liveScope`
  drops `source_system='autocount'` from every queue, group and tile, and a facet click drops
  them from the table — but with NO facet engaged they stay visible, openable and searchable.
  **A facet may never print a number its own click cannot produce.**
- **Nothing on the list says the same thing twice.** The `Delivery` cell never repeats the
  sentence `Actions` already carries; `Overdue` has exactly ONE home (the QUEUES rail);
  a LOGISTICS row counting zero is not rendered — **but `Khor Yee · pending 0` stays, because a
  person on the roster is not a filter statistic.**
- **Every money figure is `fmtMoney` from `packages/shared/src/money-format.ts`.** One spelling,
  asserted by identity, never by two implementations agreeing.
- **The stage pill and the dots sit side by side.** The pill says WHERE the order is; the dots
  say WHICH PART has trouble.

---

# §4 · The order drawer

### MISSION
Everything about one order, in the order a human's brain asks for it.

### WORKFLOW — the six questions, and the order is the point

**~80% of openings end at step ②.** Every step must finish its job ALONE, and **three different
people enter at three different steps** — so the six are an order you may ENTER AT ANY POINT,
not a path you must walk.

```
①  Whose order is this? Does it concern me?
②  What do I have to do now?          ← 80% stop here
③  Why?
④  What did they buy?
⑤  Is there a money problem?
⑥  What has happened?
```

**One tension, ruled rather than left to layout:** money is step ⑤ when READING (催钱前先看货)
and the FIRST SECOND when SPEAKING — so the figure travels independently of the step that
explains it.

### THE LAYOUT LAW — L1 to L4, frozen 2026-07-28

**L1 — six REGIONS OF RESPONSIBILITY** (not places). Each carries a contract, and **the
"does NOT answer" half is the load-bearing one**:

**R1 · Identification** — *whose order is this, does it concern me?*
Done when ONE plain sentence carries both halves: whose (customer · the Ref they recognise · the
date we promised) and my role. Fed by identity, the promised date **as identification only,
never as a judgement**, and the outstanding figure as a persistent fact resident here.
**Never judges urgency and never chases.** One exception: a missing building type is handed to
R2 as WORK, because it blocks a booking. No date → *"date not set"*; no prices → **"not priced",
never RM 0.** **Never absent — all three readers enter here.**

**R2 · The work** — *what do I have to do now?*
Done when EVERY open item is listed, each saying what · with whom · by when. Fed by the actions,
the verdict (how late → order and tone) and the DOOR that closes each item, which travels with
it. **It never asks the reader to work out what to do** — the engine computed it, and making a
human re-derive it wastes the computation. **When empty it must SAY SO plainly: silence is a
failure**, because a blank reads as *"I have missed something."* **Never absent.**
**Records do NOT feed this region** — the engine reads the same stored signal and raises the
action itself. **There are ZERO cross-region channels.**

**R3 · Explanation** — *why?*
Done when there are **THREE INDEPENDENT ANSWERS — goods · delivery · money, one line each, and
they may never be merged into one summary.** Fed by commitment ⟷ reality subtracted per track.
**It never tells anybody to do anything**, and it does not lay out evidence — PO numbers, unit
identifiers and working-day arithmetic are the SECOND sentence, not the answer. **A track that
is fine does not explain itself**, and when nothing is wrong on any track **the region does not
draw at all**: a block that says *"nothing is wrong"* spends height to say nothing. Unknown IS
an answer — *"the factory has not given a date."*

**R4 · Contents** — *what did they buy?*
What · how many · which spec, **in human words, not codes.** It proves nothing. **Its normal
state is UNREAD, and that is correct, not failure** — three things trigger it: the customer is
asking · goods must be counted for a PO or a delivery document · R3 did not add up.

**R5 · Money** — *the EXPLANATION half of the money question.*
What was collected · how storage accrued · whether the due date passed · whether a manager
released it. **It does NOT answer the figure itself** — that is a persistent fact resident in
R1, because the SPEAKING order needs it before the READING order arrives. **Never cost, never
margin.** **Half of it cannot be built today**: the payment breakdown reads a ledger with no
reader and can contradict the figure, so until that is fixed it states only what can be computed
exactly.

**R6 · Record** — *what has happened?*
Who · when · what they did, in time order, **with what was said kept verbatim — plus what is
missing.** It records what a PERSON did, never the system's own bookkeeping. **It produces a
SIGNAL and stops**; the engine decides whether that signal is work. Documents have **three**
states: exists · cannot exist yet (**renders nothing**) · should exist by now (says *missing*).
**What is empty does not appear at all.**

**Progress is a VIEW of R2, not a region.**

**Three things are deliberately NOT regions and never may be:** Evidence · Doors · an overall
status.

**L2 — information depth.** Four depths; every region is placed on one; three depth rules cross
regions.

**L3 — states.** **Two states, not five**, and **states are never stored and never reach the
screen.** `Unknown` is an ATTRIBUTE, not a state.

**L4 — the slot contract.** Six slots. **The shell never receives a state.** `DetailShell` has
no `state` prop and never may have — seven constraints are enforced as TYPES, checked by `tsc`,
not by the test runner. **`ProgressSlot` carries no events, actor, timestamp, KPI or actions**,
so *"Progress carries no buttons"* is a type rather than a hope.

**Persistent Facts is RESERVED, not law.** A persistent Outstanding would turn R1 into
Header-Everything, because *"you need it in the first second of a call"* is equally true of four
other facts — convenience is a gradient and gradients do not hold. **It is an independent
concept, not a member of any region**, and its admission test admits no new member today.

**Gap is RESERVED, not built**, with its upgrade trigger written down.

### WHAT IS ON SCREEN TODAY
`apps/web/src/pages/operation/components/OrderDetailDrawer.tsx`, **7,717 lines** ·
***measured 2026-08-06 — read STRUCTURALLY, not line by line***: its tab union, all 44 panel
titles, its two-column shell, every hook it calls and every endpoint it writes were read; the
individual panel bodies were not. **It is the largest file in the web app and nobody has read
it end to end, including this audit.**

**It renders IN PLACE of the list**, not as an overlay — the sidebar and right rail stay.
`‹ n of m ›` steps through the SAME filtered, sorted list the table shows.

```
FULL-WIDTH BAND    save bar (renders nothing until something is edited)
                   the journey strip · the OPEN ACTION LIST with its C6 checklists
                   the Delay-planning FORM — only while the ladder has that action open
                   the operator's own free-text note

LEFT 280px         ① Identity          CustomerIdentityCard
(collapses to 56)  ② Current Action    CallsPanel        — ALWAYS visible, never hidden
                   ③ Current Issues    CurrentIssuesPanel — renders NOTHING when healthy
                   ④ Progress          JourneyCard (the spine)
                   ⑤ the section rail  Loan · Documents · [Cases] · Activity

RIGHT              the selected tab owns the whole column
```

**EIGHT tabs, and FOUR of them live on the SPINE, not the rail** — `items · delivery ·
balance · storage` are spine steps; `loan · documents · cases · activity` are the rail's
utilities. **`Cases` is the only tab that comes and goes**: an order with no case shows
nothing, because a permanent tab reading `0` on every clean order is the empty box the law
forbids.

**Sub-components measured:** `OrderJourneyHeader` 420 · `OrderDocuments` 303 ·
`DelayPlanningPanel` 132 · `BookingSpine` 69 · `CustomerIdentityCard` · `CallsPanel` ·
`CurrentIssuesPanel` · `JourneyCard` · `MoneyCard` · `StorageCard` · `PaymentForm` ·
`BookingBlock` · `PartnerRulesEditor` · `DeliveryPhotoRow` · `ReceiveLineModal` ·
`LoanSofaModal` · `ActionsMenu`.

### WHAT THE DRAWER WRITES — the full list, and it crosses four modules

| Hook | Endpoint | Whose record |
|---|---|---|
| `useSaveOrderControl` | `PUT /operation/orders/:id/control` | Orders |
| `useUpdateOrder` · change requests | `/orders/:id/...` | Orders |
| `useRecordPayment` · `useVoidPayment` | `/operation/orders/:id/payments` | **Payment** |
| `useConfirmBooking` | `/operation/orders/:id/booking/confirm` | **Delivery** |
| `useIssueDeliveryOrder` | `/operation/orders/:id/delivery-order` | **Delivery** |
| `useUploadDeliveryPhoto` · `useDeliveryPhotos` | delivery photos | **Delivery** |
| `useSetPartnerDeliveryRules` | partner rules | **Delivery / carrier config** |
| `/api/ops/stock/release` · reserve picker | stock register | **Stock** |
| `useLoanSofa` | `/operation/orders/:id/loan-sofa` | **Stock** |
| `useRecheckStockMutation` | re-derives readiness | Stock (read) |

> ✅ **D2, 2026-08-06 — the third receiving door is GONE.** `useReceiveLine` and
> `POST /operation/orders/:id/receive-line` are **deleted**, with the modal and its suite.
> It booked units into the stock register and stamped `line_received` **without opening a
> Receiving Session** — no `warehouse_receipts` row, no `receiving_events` entry, and it never
> moved `purchase_order_lines.received_qty`. **That is a second RECORD of one act, not a second
> door onto it.** Measured before removal: **used zero times** (`line_received` empty on all 65
> control rows, 0 units reserved to an SO) while the Receiving Workspace had posted 3 sessions.
> **The route was deleted rather than left unrendered** — Purchasing's own C1 ruling: *a live
> route with no caller is a bypass one curl away.* The received count STAYS on the Items tab as
> a FACT; the hand-over is the PO row's existing `Check in` link.

**The drawer is NOT migrated to `DetailShell`, and that is a RULING, not a gap.** L4 requires a
4-tuple of persistent facts; on the live drawer those four sit in four different blocks, and the
header carries the ruling *"ZERO order data here — the identity lives in the Customer card
below."* Rendering it through the shell would create a facts strip that does not exist —
a visual change, permanent height, and a reversal of a frozen ruling.

### FROZEN RULES
- **The action engine is the ONLY source of actions.** Everything else produces SIGNALS. An
  action born elsewhere has no due, no owner and no measured completion.
- **A Follow-up is NOT an Action**, and the two may never share a list.
- **"Missing" splits in two:** a human can fix it → an action. Nobody can fix it → a fact, and
  a defect. Never a task.
- **The right panel does not edit.** One editing surface per fact.
- **The drawer's action list is built from the SAME call as the row's pill**, so its first row
  IS that pill structurally, not by careful agreement.

---

# §5 · Goods on an order

### MISSION
Know whether the goods this customer is waiting for are secured, and chase the factory when
they are not.

### WORKFLOW

**`Issue PO to {supplier}`** — **defined ONCE, in
[`../purchasing/MASTER.md`](../purchasing/MASTER.md) §3. Orders DISPLAYS it; it never re-states
it.** Task owner: the PO-duty holder.

**`Call {supplier} — confirm ready date`**
- **Trigger** — ready date missing · due for re-confirmation · passed with no goods in · later
  than the customer's date · changed by the supplier.
- **Checklist** — production status · ready date · ready quantity · any delayed item · record
  the latest ready date · record the outcome.
- **Completion** — the latest ready date AND the outcome are recorded.
- **Due** — red once inside the arrival window. **The window and every number in it are owned
  by [`../purchasing/MASTER.md`](../purchasing/MASTER.md) §2.3.**
  `arrival window = customer date − production working days − order-by buffer`.

**Supplier exception** — goods short, damaged or wrong. One shared vocabulary:

```
Receiving Exception Created → Call {supplier} — confirm what happens next
    → Waiting Supplier Reply → Waiting Goods Arrival → Goods Received → Exception Closed
                             ↘ Supplier Cannot Fulfil → Case Owner Decision Required
```

**`Case Owner Decision Required`** is the one action that is never delegated.
**If either outcome pushes the goods past the promised date it does not invent a second customer
conversation — it opens §6 stage 1.**

### FROZEN RULES
- **A held unit is not "on the way."** A damaged unit becomes `on_hold` and stops counting as
  future supply (0299), or the planner keeps believing goods are coming that never will.
- **Orders never re-states a Purchasing number.** Production days, the buffer and the PO days
  have one home.

### 5.1 · ✅ THE LIST SEES PURCHASING'S PURCHASE ORDERS — fixed by D1, 2026-08-06

**"Has anything been ordered?" has TWO sources and the list now reads both**, through ONE
helper (`orderHasPurchaseOrder`) that the Stock cell and the drawer's journey strip share, so
they can never answer it differently again:

```
order_lines.source_po     the AutoCount importer's PO
po_skus                   the SKUs a REAL purchase order covers, linked the drawer's own
                          way — purchase_orders.so OR so_refs[] — batched over the page
```

**What it was before, and why it is written down rather than forgotten.** The only evidence on
the wire was `source_po`, a column **only the AutoCount importer writes**;
`order_supplier_threads`, the other link the list already selected, holds **ZERO rows**.
Measured on production: **19 of 28 live orders were covered by a real purchase order and 0
carried `source_po`**, so **`SO-1206` · `SO-1213` · `SO-1216` · `SO-1257`** showed a red
*"Stock — no PO raised yet"* dot and an **`Issue PO`** instruction over goods Purchasing had
already bought — while the drawer, which read both sources, disagreed with its own list.

**FROZEN RULES this adds**
- **`po_skus` ABSENT is UNKNOWN, never "no PO."** The three-way discipline `photoOnFile` and
  `deliveryOrderIssued` already follow: a browser on a new build against a pre-D1 Worker
  reproduces the pre-D1 answer exactly rather than accusing an order of something it cannot see.
- **An EMPTY `po_skus` array is a real answer** — no purchase order names this order.
- **ONE consolidated purchase order serves EVERY sales order it names.** The consolidated PO is
  the normal case here, so each SO in `so_refs[]` gets the same SKU set.
- **ONE batched query for the whole page, never one per order** — asserted by a test.

**VERIFIED ON PRODUCTION, and the gap is named rather than papered over.** The app serves the
new bundle with its stylesheet applied (computed font **Inter** — the guard against an unstyled
page reporting a clean pass), `po_skus` greps **0 → 1** on downloaded bundles, and the four
orders are still covered at the database: **SO-1206 → PO-2036 · PO-2037 (7 SKUs)** ·
**SO-1213 → PO-2036 (4)** · **SO-1216 → PO-2036 · PO-2037 (7)** · **SO-1257 → PO-2047 (2)**.
**What was NOT verified with eyes: the authenticated Orders screen.** The browser pane holds no
operator session and entering a password is a red line, so those four rows reading differently
rests on the tests, the two negative controls and the bundle greps.

---

# §6 · Delay planning

### MISSION
Decide what to do about a factory slip **before** anyone talks to the customer.

### WORKFLOW — a state machine with a gate

> **The principle: the customer is the LAST to know.** A supplier saying "12 Aug" is not yet a
> delay — we may have the item in ready stock, or another supplier may cover it. **Only when we
> have tried and failed does anyone reach the customer.**

**The word is `Delay planning`. `Recovery` is banned on screen** — staff say *"this order going
to delay"*, and nothing is being recovered yet.

**Stage 1 — Delay planning**
- **Trigger** — the latest supplier ready date **>** the customer's promised date.
- **Owner** — Operations. **The customer is not contacted in this stage.**
- **Checklist** — confirm the supplier's real ready date · check ready stock or another supplier
  · check available dates with logistics · decide the best delivery date · **decide whether the
  customer needs to be told at all.**
- **Completion** — the delay decision is recorded.
- **Due — 2 WORKING DAYS** from the day the supplier's date first overshoots the promise.
  **That day was stored nowhere**, so 0305 stamps `delay_detected_at` + the supplier date it is
  about (`delay_detected_eta`) **with a database TRIGGER** — `line_etas` has three doors, and a
  stamp written by one route is a stamp two doors walk around. Server-owned, so nobody can move
  their own deadline. **Office calendar.** Two days is not slack: Operations must confirm the
  real date, check ready stock, check another supplier and check dates with logistics before
  there is anything worth saying.

**The gate — can we still make the promised date?**

```
YES → continue the original delivery. The customer is never told.
NO  → Call {logistics} — arrange new delivery date
```

**Stage 2 — Logistics arranges the customer's new date** (opens only on NO)
- **Owner** — Operations. **The CONVERSATION is logistics'; the ACTION in this portal is ours.**
- **Completion** — a customer-confirmed date AND a time slot are recorded.
- **Due — the SAME WORKING DAY the decision was recorded** (`delay_decision_at`, 0304), not the
  supplier's slip. A Friday-afternoon decision is due that Friday and turns late on Monday.

**Why Operations owns it:** eight logistics companies are in use, **only NETS has a login**, and
the partner portal has no appointment screen. A task owned by "Logistics" would be one nobody
can see or close. It moves to them the day that portal covers appointments.

**Stage 3 — the system records it.** No human step.

### FROZEN RULES
- **THE PROMISED DATE NEVER MOVES.** `orders.delivery_date` stays at what was sold, so every
  late/overdue/on-time figure keeps measuring against it and a delay can never be tidied away.
  **The delay flow must never call `set_order_date`** — that RPC exists to correct a date typed
  wrong at the counter, not to rewrite history. **The route never opens the `orders` table at
  all**, so it is unreachable even by accident, and the panel has no date input.
- **NOT the customer's extension fields.** 0196 caps `extension_count` at 1; writing a
  Carres-caused delay there **silently spends the customer's only extension**, so the day they
  genuinely ask to postpone the portal refuses them for our factory's fault.
- **`delay_decision_eta` earns its column.** A decision is about ONE supplier date; if the
  factory slips again the pair stops matching and Delay planning re-opens by itself. Without it
  one answer would close every future delay on that order.
- **Two clocks, and they never overlap.** Operations gets two days to find out whether there is
  really a delay; the moment it decides there is, the customer hears the same day.

---

# §7 · Delivery on an order

> **The delivery PAGE is [`../delivery/MASTER.md`](../delivery/MASTER.md). The ACTIONS are
> defined here, once.** That page renders them and writes nothing.

**`Assign logistics`** — trigger: the order needs delivering and no company is chosen ·
completion: **a company is recorded. Never "they accepted"** — assigning is our decision ·
due: 3 working days before the customer's date.

**`Call {logistics} — confirm delivery date`** — trigger: logistics assigned but the customer
has not confirmed BOTH a date and a slot · completion: **a customer-confirmed date AND slot
exist. A date logistics proposed is a fact, not a confirmation** · due: a settable number of
working days before the date (**1 today**) · the checklist adds driver name, driver phone,
vehicle number and lift/registration requirements **for condominiums**.

**`Issue delivery order`** — trigger: customer-confirmed date **AND** slot **AND** core goods
ready **AND** the payment condition passed — **all four. The action appears only when it can
actually be done.** The SYSTEM produces the document; **nobody writes one by hand**, and the
number is the locked `DO-DDMMYY-NNNN` scheme seeded on the order id, so a reprint matches the
signed original.

**`Deliver today`** — trigger: the confirmed date is today and nothing has been delivered ·
completion: **Delivered**, or a **Delivery Exception carrying its reason** (customer
unreachable · customer rejected the date · driver absent · vehicle breakdown · condominium entry
refused · lift booking not done · delivery failed). **Every module fails the same way: one
Exception plus a Reason, never a family of failure words.**

**`Upload delivery photo`** — trigger: delivered, no photo · due: 1 working day after delivery.

### FROZEN RULES
- **The slot length comes from the BUILDING TYPE** — condominium, apartment and office take a
  half-day; landed and retail take a full day.
- **Grouping:** a bed set (mattress + frame) can never be split · a sofa may travel on a second
  trip only if the customer agreed · accessories never block a delivery. **The default is one
  trip**, and the split question is asked only when the sofa would hold the bed set back.

---

# §8 · Money on an order

> **The collections DESK is [`../payment/MASTER.md`](../payment/MASTER.md). The GATE and the
> arithmetic are here, because they decide whether goods move.**

### THE ONE NUMBER

```
outstanding = Σ order lines + add-ons + chargeable storage fee − orders.paid
```

**ONE rule, `packages/shared/src/order-money.ts`, and FOUR readers** — the ladder's lock, the
row pill, the drawer strip and the collections desk. Before it existed, three surfaces asked
three different questions and each pointed at a column nobody wrote.

**Four facts a chat will get wrong unless it reads them here** (measured live 2026-08-13):

- **THERE IS ONE PAYMENT WRITER, and the ledger is not it.** `payment_record` (0343) writes the
  `order_payments` row AND moves `orders.paid` in one transaction; the direct write door is
  closed (`authenticated` has no INSERT/UPDATE/DELETE). **`orders.paid` stays the money truth
  and the ledger is never summed into an outstanding** — the raw-create deposit is recorded as a
  MIRROR row (`counted_in_paid = false`) because the create RPC already put it inside
  `orders.paid`, and adding them would read a half-paid order as settled.
- **A VOID IS A STAMP, NEVER A DELETE** (0343), so **a voided row is not money** (0347). Every
  reader asks the ONE predicate, `isLivePayment` — the SO document's payments block, the
  drawer's storage sum, its receipt list and the collections desk. A second spelling of
  `voided_at` is how four readers drift apart.
- **`ops_order_control.balance` means what the customer STILL OWES** (0165), not the total.
  Anything that subtracts payments from it subtracts twice.
- **An order whose value is UNKNOWN never holds anything.** A number nobody knows may not stand
  between a customer and their goods — **unknown warns, never blocks.**

**`ops_order_control.payment_status` and `paid_amount` have NO authority over money.** They keep
their columns (1 row and 0 rows live); the collections desk derives its `Overdue · Unpaid ·
Partial · Paid · No price yet` from the one arithmetic and the collection clock, and its
hand-keyed dropdown is retired (0347). A money state a human can type is a money state that can
contradict the figure.

### THE COLLECTION CLOCK — one arithmetic, T−3 · T−2 · T−1
`packages/shared/src/collection-clock.ts`. The final deadline is **1 working day before the
delivery** on the Mon–Sat delivery week with Malaysian public holidays, anchored on the
**customer's confirmed day, else the promised date**; no anchor → no clock, because a step that
cannot be late is not urgent. `t3` and `t2` are attention, **`t1` is the deadline** — logistics
ask for the DO the evening before and the DO door refuses while money holds, so a balance
uncollected at T−1 is a delivery about to slip. Two consumers, one module: the collections desk
and the Work engine's `collect` / `issue_delivery_order` dues.

### `Collect RM {amount} from {customer}`
Trigger: outstanding > RM 0 · completion: outstanding = RM 0 ·
**survives delivery** — a delivered order that still owes keeps this action and its red dot.

### MONEY LEAVES A TRACE ON THE ORDER
`payment_record` and `payment_void` write `payment.received` / `payment.voided` into the order's
own activity in the same transaction as the money (0347), each carrying its amount, kind,
receipt number and — on a void — its reason. The two event types were declared in the taxonomy on
2026-07-10 and had never had a writer, so `orders.paid` could move with nothing on the order
saying who moved it.

### THE GATES — different from display order

**A gate REFUSES an action. Display order only decides what is read first.**

**Issuing the delivery order is the HARD gate**, not agreeing a date: a date can be agreed while
the goods and the money are still coming. Issuing is refused unless every goods line is reserved
to this order (accessories pass automatically), **the money is collected**, and the date is not
a Sunday or a Malaysian public holiday.

**An unpaid storage fee is part of the money, and there is no softer rule for it.**
`orderMoney` returns `holding` beside `outstanding` and `holds` beside `owing`, because
**a release must lift the HOLD without forgiving the MONEY.**

**The emergency override — the only way past it.** **The manager approves it, nobody else.**
Two outcomes, and the approver picks one out loud:
- **released, fee still owed** — the goods go, the money action stays open. **This is the
  default; an override must never quietly forgive money.**
- **released and waived** — written off with a reason. `storage_fee_override = 0` already means
  *owes no storage fee*, so `approved` means RELEASED, not FORGIVEN, and the figure written off
  stays on the record.

**Operations is told by the work itself** — the moment the override is granted, the order's top
action changes from collecting to delivering. **No separate alert engine.**

**AGREEING a date is softer than ISSUING.** It WARNS about goods, money and the calendar so
nobody promises a day the goods cannot make, but it refuses only two things:
**Sunday and Malaysian public holidays** (no company runs), and **a missing building type**
(a condominium can only take a half-day, so the date cannot be agreed without it).
Everything else warns: a company's own working days, closed dates, capacity, notice period —
**a phone call beats a calendar.**

---

# §9 · Documents, evidence and messages

### DOCUMENTS
`OrderDocuments.tsx` (303 lines) lists the document KINDS an order carries.
**A missing delivery photo is NOT a health line** — `Upload delivery photo` already says it with
a due date attached, so the health line was the same fact in the voice of a problem. Invoice and
delivery order MUST still be stated as missing, because **nobody can DO a missing one.**

### THE MESSAGE RULES
Most actions are performed by sending a message, so the message is part of the action. The
bodies live in `apps/web/src/lib/wa-templates.ts`; **the rules live here.**

- **A customer message never carries a delivery date.** Logistics agree the date and slot with
  the customer; if a customer asks us, we give them the logistics company's contact. The ONE
  exception is the delivery-eve reminder on an order still owing money, which may say
  `today` / `tomorrow`.
- **No pressure phrasing to a customer** — never *"settle by"*, never *"deliver on time"*.
- **The salutation is never guessed.** Preferred-name field when set, otherwise the customer's
  own name in Title Case. **Never infer `Mr` / `Ms`.**
- **An outside party never sees the SO number.** A supplier message leads with the PO; a
  logistics and a customer message lead with the CR/TCF ref.
- **Every order named in a message carries its own REF** — that is what makes a group reply
  traceable back to one order.
- **One counterparty, one message.** A bulk send produces ONE message per supplier and per
  logistics company, never one per order: a supplier message aggregates by SKU; a logistics
  message keeps each delivery as its own block, because each has a different customer, address
  and day.
- **Two tones per audience** — `Remind` before the date, the firmer `Call {party} — …` once it
  has passed. Not a third vocabulary.

### THE OBSERVATION LAW
**The portal records only what it OBSERVED.** Pressing a channel button records that the
channel was OPENED — a real send or receipt may only be recorded by something that watched it
(an API, a portal, a read receipt). **This binds the RECORD, not only the screen:** a page can be
re-rendered, a written row cannot be un-written.

---

# §9.5 · MODULE OWNERSHIP — where the record and the completion evidence live

**Orders may SHOW and TRIGGER cross-module work. It owns the record only where this table says
so.** Audited 2026-08-06 by tracing every write the list and the drawer make.

| Concern | Orders is | The RECORD lives in | Completion evidence |
|---|---|---|---|
| the customer order · stages · PIC | **THE OWNER** | `orders` · `ops_order_control` | the stage and the assignment stamps |
| the action engine | **THE OWNER** | nothing stored — derived | an action closes when its own outcome is recorded |
| delay planning | **THE OWNER** | `ops_order_control.delay_decision*` (0304/0305) | the decision + the supplier date it was about |
| storage hold and its release | **THE OWNER** | `ops_order_control.storage_*` | `storage_waiver_status` + `storage_fee_override` |
| the money GATE and the arithmetic | **THE OWNER** | `orders.paid` | `outstanding = 0` |
| collecting the money | **a trigger** | `order_payments` — [`../payment/MASTER.md`](../payment/MASTER.md) | **0 rows: the ledger has no reader; `orders.paid` is the truth** |
| buying the goods | **a SUMMARY, and a broken one** | `purchase_orders` — [`../purchasing/MASTER.md`](../purchasing/MASTER.md) | the PO exists · `received_qty` |
| receiving the goods | **a SUMMARY** — the count is read, never written (D2) | `warehouse_receipts` · `receiving_events` — Purchasing | a posted Receiving Session |
| reserving / releasing a unit | **a trigger** | `ops_stock_items` — [`../stock/MASTER.md`](../stock/MASTER.md) | the unit's status + `reserved_ref` |
| booking a delivery | **THE OWNER of the record** | `ops_order_control.booking_*` | a customer-confirmed date **and** slot |
| the delivery WORKSPACE | a VIEW | nothing — [`../delivery/MASTER.md`](../delivery/MASTER.md) | — |
| carrier rules | 🟡 **a duplicated editor** | the partner's own config | — |
| a customer complaint | **a link** | `service_cases` — [`../service/MASTER.md`](../service/MASTER.md) | the customer confirmed |
| a supplier claim | **not present** | `supplier_claims` — Purchasing | — |

**Two ownership defects, both reported and neither fixed here:**

✅ **Receiving was genuinely duplicated and is FIXED (D2, 2026-08-06).** The Orders drawer's
write door is deleted; the Items tab reads the count and hands over to the Receiving Workspace.

🟡 **`PartnerRulesEditor` edits carrier configuration from inside one order's drawer.** A
carrier's working days and capacity are not a fact about this customer's order.

---

# §10 · Cross-object decisions

| Decision | Ruling |
|---|---|
| **No overall Order Status** | Facts are stored independently and the view is computed. A single summarising word would be a fifth source of truth. |
| **The engine is the only source of actions** | Everything else produces SIGNALS. An action born elsewhere has no due, no owner, no measured completion. |
| **A second page is a VIEW, never a module** | It renders these actions through the same shared computation. **The same action is never defined twice.** |
| **One rule, many readers** | Money has ONE module and four readers; words have ONE module and every surface. Two implementations that merely agree is the arrangement under which a third, wrong one grows unnoticed. |
| **Widths are MEASURED in a real browser** | jsdom has no widths. A guessed number is never written down. |
| **Imported archive rows are excluded from WORK, never hidden** | And no card may propose a backfill for them. |

---

# §11 · Approved Evolution — decided, deliberately not implemented

## Sales Orders post–Card 10 capabilities — APPROVED / LOCKED (Loo, 2026-08-11)

The owner explicitly reopened the Sales Orders header/action surface after reviewing the
2990 reference. The absence of a capability in the current repository is not a reason to
refuse it: governance prevents an agent from inventing product scope; it does not prevent the
owner from approving useful new scope. These decisions supersede any earlier proposal that
excluded them merely because they were not already implemented.

- **Scan Order is approved as a new capability after Card 10.** It receives its own scoped
  product/build card before implementation. Because Carres uses it infrequently, the Sales Orders
  Register exposes `Scan Order` inside the page-owned `…` overflow rather than as a permanently
  visible Toolbar action. The card must define the accepted source, extraction/validation,
  duplicate handling, operator review and the final write boundary. A reference product proves
  the door, not Carres business rules or visual styling.
- **✅ SALES ORDER SETTINGS — BUILT 2026-08-14.**

  The gear was a `Coming soon.` placeholder — a promise about the product on an operator's screen —
  and the settings §11 names had no owned home. Now: the one Settings Workspace at
  `/operation/settings`, a section per module; the gear is the permission-filtered launcher
  `ui/MASTER.md` rules (current module's settings, then `All System Settings`) and never an editing
  form; and `Sales Order Settings` is the section Sales Orders owns.

  **It is deliberately SMALLER than the name it replaces, and the reason is the finding.** §11 names
  three things — Sales Order-controlled option pools · Order Entry fields · payment-method choices —
  and on the evidence **all three ARE the Order Entry config**. Migration 0174's `config.options`
  look like the option pools and are not ours: its own header calls them *display/filter aids*, and
  its `option` columns are `status` (the order state machine, not a pool), `dealer_name` ·
  `salesperson_name` · `warehouse_name` · `delivery_partner_name` · `item_group` (master data owned
  by Stores, HR, Stock, Delivery and Catalog) and `payment_method` (owned right here). **Curating
  another module's master data from the Sales Order settings page would be a second editor for one
  record** — the defect ownership Law A/C exists to stop. They are not edited here; the page names
  the owner of each instead.

  Order Entry was RELOCATED, not copied: it was reachable at `/principal?tab=order-entry` and from
  the POS sidebar, and both now lead to the one Settings Workspace over the same single config row.
  Register columns and saved views stay on the Register — they belong to the person, not the
  business. A **source guard** asserts the page reaches no order writer at all, because §11's
  *"never an edit door into historical Sales Orders"* is a ruling a render test cannot hold: such a
  mutation would render as an innocuous button.

- **🔨 SALES ORDER INTAKE — the accepted source is SETTLED; the capability keeps its own card.**

  **Owner ruling, 2026-08-13:** do not offer an implementation menu. Read the authoritative MASTER,
  the current Sales/POS intake path, the existing `Scan Order` intent and the 2990 implementation,
  then give the evidence-based recommendation — and *"AutoCount CSV is already temporary and must
  not be promoted into the target architecture merely because it is easiest to build."* This is that
  answer.

  **FACT — what `Scan Order` was built to solve.** 2990 implements it, and the implementation
  settles the question the capability matrix left open.
  `2990s/apps/backend/src/components/ScanOrderModal.tsx:1-19` calls it *"v1 of the handwritten-slip
  OCR flow"*: the operator drops or snaps photo(s) of a **showroom sale-order slip** (jpeg/png/webp,
  PDF accepted), extraction reads the handwriting against the live SKU/fabric catalog, the operator
  reviews and corrects, and `Open in New SO` opens the normal create page prefilled.
  `2990s/apps/api/src/routes/scan-so.ts:1-6` names the input exactly: *"phone photos of Zanotti /
  AKEMI-style carbon-copy forms"*. **The accepted source is a photograph or PDF of the handwritten
  showroom sale-order slip — not an AutoCount export.**

  **FACT — the write boundary is defined, and Carres has already proved it.**
  `ScanOrderModal.tsx:17-18`: *"The modal NEVER creates the SO itself — everything lands in the
  normal New SO form where pricing, variants and validation run as usual."* That is byte-for-byte
  the boundary the Copy slice shipped and production-verified on 2026-08-13. **Intake needs no new
  write door, no second create path and no new contract.**

  **FACT — Sales Order Settings is a hard dependency, not a nicety.** The extractor does not
  free-type its answers: `ScanOrderModal.tsx:74-78` — an `OptionMatch` carries *"a
  so_dropdown_options row VALUE, already validated server-side against the ACTIVE list"*, and the
  prefilled payment block is *"SO-Maintenance-matched"*. This is why Settings had to come first,
  and it now has.

  **FACT — the size, measured.** `scan-so.ts` is 1,475 lines and `ScanOrderModal.tsx` 671; the
  learning store is two tables (`so_scan_samples`, `so_scan_rules`) holding operator-confirmed
  samples, per-salesperson distilled handwriting rules and a global alias layer. Carres has none of
  it, and `apps/api/src/types.ts:3-19` carries no AI binding.

  **INFERENCE — the credential is not the blocker it looks like.** Carres already ships a capability
  whose credential arrives later: `types.ts:13-16` marks `STRIPE_SECRET_KEY` optional and the routes
  answer `503 stripe_not_configured` until `wrangler secret put` runs. 2990 uses the identical shape
  for `ANTHROPIC_API_KEY` (`2990s/apps/api/src/env.ts:36-40`, `503 anthropic_key_missing`). Intake
  can be built and merged the same way and go live the moment the key is set.

  **RECOMMENDATION — NOT LAW, and it carries its falsifier.** Build Intake as `Scan Order`: a
  photo/PDF of the handwritten showroom slip → extraction → operator review → prefill the
  authoritative create form. **Give it its own card; do not fold it into a closeout** — §11 already
  requires *"its own scoped product/build card before implementation"*, and ~2,100 lines of
  reference implementation plus two tables and a vision integration is exactly the size that ruling
  exists for. **Relocating the AutoCount CSV importer into the Sales Orders `…` is explicitly NOT
  recommended:** different act, different source, it retires at go-live, and putting it behind the
  word `Scan` would teach operators that `Scan` means *import a spreadsheet* — a word
  `COPY-STANDARD.md` would then have to un-teach.

  **What would overturn this:** evidence that Carres showrooms do not write orders on paper before
  they reach the portal — a measured intake path in which every Sales Order is typed directly into
  the POS at the point of sale. If that is how Carres actually runs, `Scan Order` solves a problem
  Carres does not have and the capability should be retired rather than built.

  **THE REMAINING GAP, stated plainly.** Nothing about the source is unresolved. Two things are, and
  both are owner-side: ① **does the Carres showroom write a handwritten slip before the order
  reaches the portal?** The repository holds no evidence either way, and the whole capability rests
  on it. ② **`ANTHROPIC_API_KEY` as a Cloudflare Worker secret** — only the owner can set it, and no
  secret may be written in code (CLAUDE.md red line 3).

- **`Sales Order Settings` is required — APPROVED / LOCKED naming and placement.** `SO
  Maintenance` is retired. The Settings section title is `Sales Order Settings`, parallel to
  `Purchasing Settings` and distinct from the overall `System Settings` Workspace. It owns Sales
  Order-controlled option pools, Order Entry fields and payment-method choices; current-user
  Register Columns and Saved Views stay on the Register. It is never an edit door into historical
  Sales Orders. It is planned after Card 10 and is reached only through the global Page Header
  Settings gear: the permission-filtered launcher offers `Sales Order Settings` for the current
  module and `All System Settings`. It is not a Sales Orders tab, portal-navigation item, Work
  Toolbar button or `…` item.
- **Register `Edit` opens the full Sales Order Workspace — APPROVED / LOCKED.** It never edits
  inside the grid and never opens a small generic modal. The row context menu's `Edit` navigates
  to that Sales Order's owned full-page Workspace in edit intent. The Workspace header keeps the
  durable History · Order Journey/Relationship Map · Print PDF controls alongside the governed
  edit/cancel actions. A change that remains above the existing contractual floors may use the
  governed revision Save door; a change blocked by production commitment, receiving, invoice,
  delivered or cancelled floors never silently overwrites the order and must follow the owned
  amendment/request lane when that lane is available. **PO existence alone is not the Carres
  edit gate** and 2990's wording does not replace Card 1's authority. Register → Workspace is the
  adopted behaviour; Carres revision causes, gates and evidence remain authoritative.
- **Selected-order PDF export is approved.** Selecting one or more rows reveals a contextual
  selection action bar above the table containing the truthful selected count, `Clear` and
  `Export PDF (N)`. It uses the existing governed Sales Order PDF renderer/output per order;
  the implementation card must define multi-order download packaging and failure reporting.
  It is a view/document action and therefore remains within the Register boundary.
- **The contextual bar follows the 2990 interaction pattern, not its appearance.** Carres
  frozen tokens/components govern colour, typography, radius and spacing. It occupies or
  replaces governed toolbar space where possible; it must not create a permanent empty band.
- **`View Flow` capability is approved; its complete route layout is still UNRESOLVED.** It is one
  map, not separate duplicate Document and Journey maps. From a Sales Order it lets every
  authorised reader understand where the customer's order has reached, what obligation is next
  and which real document / Unit ID proves every completed leg. `Order Journey` is not a second
  capability or second map.

  **BUSINESS-RULE GATE — owner stop point, 2026-08-11.** The map must not be frozen or implemented
  until the per-line goods-source and fulfilment-route decision table is complete. At minimum it
  must cover Ready Stock · purchase into a Carres receiving location · supplier / AL direct to
  customer · route not yet assigned · mixed routes across one SO · route change · return. This is
  the next unresolved View Flow decision surface. UI composition does not author these routes.

  Purchasing's existing two-path law is authoritative: a purchased line either enters a Carres
  receiving location, where the governed Receiving record proves physical arrival, or it never
  touches a Carres floor, where Operation explicitly confirms fulfilment. Direct-to-customer and
  customer self-collection belong to that second path. **Warehouse is never the default route.**
  A direct line must not manufacture a Warehouse node, bin, GRN or received quantity. An
  unassigned route is shown truthfully as unassigned; it is never guessed.

  The Sales Order is the anchor. The map renders only evidence that exists for the selected line's
  actual route: real SO · PO · Unit ID · Receiving/GRN evidence when applicable · actual Carres
  location when recorded · DO · Invoice · receipt/payment evidence · Loan · Case numbers, their
  owning module, governing dates and truthful lifecycle evidence. Bin/location data may appear
  only when its owning system actually records it. Demonstration names, warehouse locations, bins,
  people, dates and statuses are never promoted into product truth.

  Unit identity is shown once per real Unit and then repeated only where needed to prove that the
  same physical item moved through later evidence; a repeated Unit ID is not a new Unit. The exact
  Unit-creation event remains governed by Card 2 and the owning engine, not inferred by the map.
  A Loan is an independent conditional obligation: while outstanding it blocks No Action Required;
  after return it remains as completed evidence with the actual return date, receiver and recorded
  condition. Loan is not nested inside Delivery merely because return may follow delivery.

  The eventual map is a directed graph, not a false single timeline: goods source is a branch;
  Money and Delivery may proceed in parallel; Loan and Issue are conditional. `No Action Required`
  is derived only when every applicable obligation is clear.

  **Generated is never presented as Sent or received by the customer.** Completed/current-frontier/
  blocked/future/not-required presentation is derived from the owning modules' existing completion
  facts; it never mints a Sales Order `status` or `Current` field. Every document number opens its
  owner; the map summarises and links but never executes another module's work.

  The primary discoverable entry is the contextual selection bar immediately above the table:
  selecting exactly one row replaces the normal toolbar in that same height with
  `1 selected · Clear · View Flow · Export Excel · Export PDF`. Right-click → `View Flow` is a
  desktop shortcut to the same map, not the only door. The order Workspace Documents area is the
  third durable door. Multiple-row selection hides `View Flow` because one map has one Sales Order
  anchor. It is not a Page Header action, tab or default table column. Until Carres owns a canonical
  customer entity, the map may use the selected order's normalised customer phone only for a
  clearly separate `Other orders for this customer` lane and never merge people on name alone.
  AutoCount's Document Flow and 2990's Relationship Map are behavioural references only; Carres
  ownership, evidence and visual tokens remain authoritative.

  **`Delivery` is the APPROVED / LOCKED customer-facing map label (Loo, 2026-08-11; wording
  re-ruled by the Delivery Blueprint 2026-08-14).** The map never exposes the engine term
  `Delivery Attempt` or asks a person to create a `Delivery Visit`; Delivery owns that formal
  audit object and employee pages use `Delivery History`. Each actual run is shown inside the
  `Delivery` node by its DO number and date, followed by `Delivered` · `Partially Delivered` ·
  `Failed Delivery`. A Failed Delivery also shows its reason and the next scheduled delivery when
  one exists; every earlier run remains visible. A booking that has not actually proceeded is an
  arrangement (`Scheduled`, `Rescheduled` or `Delivery Cancelled`), not a Delivery Result.
  Generating a DO or booking a date never proves delivery. The append-only internal
  `delivery_attempts` / exception model remains authoritative and is not renamed by this UI law.

  **Guarantee is an APPROVED optional Sales Orders Register column (Loo, 2026-08-11).** It is
  available through `Columns`, participates in the existing saved column layout and keeps the
  locked default eleven-column order unchanged. It summarises the guarantees actually purchased
  on that Sales Order; it never invents cover from the currently available offer catalogue.
  No purchase renders `—`; sold but not delivered renders `{years}y · Starts on delivery`;
  delivered cover renders its derived lifecycle word plus `starts_on–expires_on`; an expired
  entitlement therefore changes automatically to `Expired` on read and keeps both dates visible.
  Multiple entitlements render a truthful count in the compact parent row, with their individual
  covered lines, Guarantee IDs and dates available through the owned detail/Order Journey surface.
  The column filter supports With guarantee · Without guarantee · Starts on delivery · Active ·
  Expired · Claimed. Selecting the cell opens the order's owned Guarantee detail; Guarantee remains
  line/unit-level truth even though the Register cell is an order-level summary.

**SALES ORDERS WORK TOOLBAR — APPROVED / LOCKED (Loo, 2026-08-11).** This is the Sales Orders
specialisation of UI MASTER's 45px Register Work Toolbar law:

```
NORMAL      View: All orders ▾ · Search SO/customer/phone · Export ▾ · Columns ·
            + New Sales Order · …
ONE         1 selected · Clear                         View Flow · Export Excel (1) · Export PDF (1)
MANY        N selected · Clear                                      Export Excel (N) · Export PDF (N)
```

The View dropdown owns All orders · Failed delivery · My orders · personal/team Saved Views ·
Save current view. This preserves the scope capabilities without permanent scope pills. Every
column keeps its direct header filter, so the duplicate generic Filters button is retired. The
normal Export dropdown contains current-view Excel · PDF · Print outputs; explicit selected
Excel/PDF actions are immediate pill buttons. `…` contains low-frequency page/selection actions
only and is not a dumping ground for daily work. Normal-state `…` owns `Scan Order`; selected-state
`…` may expose only actions valid for that exact selection. `New Sales Order` remains the only
permanently visible primary action. View/Search/Export/Columns structure, same-height selection
replacement and action-vs-control shape language are reusable Register Template law. Settings is
absent because the global Page Header gear owns the ERP's single Settings entry.

At the measured narrow target, the Toolbar must show every normal-state control without clipping,
shrinking frozen typography or moving the toolbar itself into horizontal scroll. The wide DataGrid
continues to own its own horizontal overflow independently.

**SALES ORDERS ROW CONTEXT MENU — APPROVED / LOCKED (Loo, 2026-08-11).** The desktop
right-click menu follows the approved 2990 Sales Orders action set and order exactly:

```
Edit
View
Preview
Print
────────
Issue Delivery Order
Copy to new Sales Order
────────
Cancel SO
```

This is a Sales Orders module exception, not a Register Template requirement for every module.
The menu copies the reference action inventory and ordering; Carres frozen tokens, typography,
spacing, hover/current treatment, permissions and confirmation components still govern its visual
and interaction treatment. Each item routes to the Carres-owned capability rather than executing
foreign business rules inside the grid: `Edit` opens the full Sales Order Workspace in edit intent;
`View` opens the owned read view; `Preview` opens the governed document preview; `Print` uses the
governed Sales Order document output; `Issue Delivery Order` hands off to the Delivery-owned issue
flow; `Copy to new Sales Order` starts a new draft from the governed copy boundary; and `Cancel SO`
uses the owned cancellation gate and destructive confirmation. The implementation cards must
define the unresolved permission, eligibility, copy-boundary and cancellation rules before those
new capabilities can write business data. Right-click is a desktop shortcut: it does not remove
the normal discoverable doors already governed for Edit, output or View Flow.

| What | Why it is not built |
|---|---|
| **`Issue Delivery Order` in the Sales Orders row context menu** | §11's locked menu lists it between `Print` and `Copy to new Sales Order`, and the Cancel slice deliberately did not add it. It is **Delivery's** issue flow, not a Sales Orders capability — the menu item is a handoff, and the handoff belongs to whichever card next touches the Delivery-owned issue door. Adding it from the Sales Orders side would have minted a second entrance to another module's act. |
| **`Scan Order` in the normal-state `…` overflow** | The `…` overflow and `Scan Order` arrive together with the Intake card. Building the overflow first, with one item that answers `503`, would put an unfinished promise on an operator's screen — the exact defect the Settings gear's `Coming soon.` placeholder was. |
| **The follow-up action after a FAILED delivery** | `Deliver today` completes on delivered OR a Delivery Exception with its reason, and **nothing yet turns that exception into the next action.** Approved shape: one Exception plus a Reason, then the next action. Belongs to whichever card next touches the delivery day. |
| **Persistent Facts as a real strip** | RESERVED, not law. It needs the four facts to have ONE home first; on today's drawer they sit in four blocks under a frozen *"ZERO order data here"* ruling. **The first page migrated through `DetailShell` is where they get that home.** |
| **Gap** | RESERVED, not built. The upgrade trigger is written into the model. |
| **The drawer through `DetailShell`** | Approved as the destination; blocked because L4's persistent-facts tuple does not exist on the drawer yet. **Not a gap — a ruling.** |
| **The delivery-appointment task moving to Logistics** | Approved the day the partner portal covers appointments. Today only NETS has a login and that portal has no appointment screen. |
| **`order_payments` gaining a real reader** | The Record-payment button writes a ledger nothing reads. The fix is one audited RPC that writes `orders.paid` too — **never by summing the ledger**, because the raw-create door double-writes. |

# §12 · Implementation debt found by the 2026-08-06 audit

**Not architecture. Each one is a build slice, and none of them changes a business rule.**

| # | Defect | Evidence |
|---|---|---|
| ~~**D1**~~ | ✅ **FIXED 2026-08-06** — the list reads both PO sources through one shared helper. See §5.1 |
| ~~**D2**~~ | ✅ **FIXED 2026-08-06** — the door, the hook, the route and its suite are deleted; a guard asserts the route now 404s. See §9.5 |
| **D3** 🟡 | **The drawer computes `stage` a SECOND time** (its own IIFE at line ~1469) instead of importing the list's exported `stageOf`. Two spellings of one derivation, in two files. | read |
| **D4** 🟡 | **The drawer computes money a second way for its own header.** The list hands down `holdAmount` from the shared `orderMoney`, and the drawer separately fetches `order_payments` for `Collected` — the one ledger the shared rule refuses to read. **The drawer's Collected and the row's Outstanding can disagree.** | read |
| **D5** 🟡 | **Carrier rules are edited from one order's drawer.** | §9.5 |
| **D6** 🟡 | **`Issues module coming — needs the ops_issues table`** is a live tooltip on the Actions menu. A promise about the product on an operator's screen. | panel titles |
| **D7** 🟡 | **The `deliver_today` checklist is empty by ruling**, so an operator expanding the day's own action sees nothing. Correct by the rule (*nobody records "goods loaded"*), and worth knowing before somebody calls it a bug. | `order-action-checklist.ts` |
| **D8** ⚪ | **`stockWindowDays` is still a flat 7 / 5** in `orderActionSignalsOf`, while Purchasing's real production numbers are 7 · 7 · **14** and manager-editable. The Orders ladder therefore turns the ready-date call red on a sofa **nine days later** than Purchasing's own window says it should. | read + Purchasing §2.3 |
| ~~**D9**~~ | ✅ **FIXED 2026-08-08** — `lineClass` answers `unknown` where it used to answer `acc`, and `acc` is now earned by an accessory word instead of by elimination. **20 orders that could never fail a stock check → 0**, with **zero** lines re-classified into anything else. Two follow-ups named and left open on purpose: delete the `lineCategory` display fold, and name the sixteen SKUs alongside migration 0148. See the D9 block above |
| **D10** 🟡 | **Two dead surfaces are still compiled into the bundle, and both had live test suites.** `OperationOrders.tsx` (450 lines, the 6-column kanban) is imported by **nothing** — §3 records that the list merged it away — and `OrderCustomerCard` (in the drawer) is exported, rendered nowhere, and superseded by `CustomerIdentityCard` (Jess 2026-07-17 rev 4). **Purchasing's own C1 ruling applies to the second one:** its `startEditRef` door has no caller, so the safe-edit mode is unreachable, **and the `status === 'place'` gate that used to guard it is gone from the component** — whoever re-mounts it inherits an editor with no gate. | `grep` — the only non-test reference to each is its own declaration |
| **D11** ⚪ | **`receive-po-<id>` names TWO different controls** in `ProcurementTabContent` — the primary `Check in` button and the always-available `Direct receive →` escape hatch. A test cannot tell them apart by handle, only by word. | read |
