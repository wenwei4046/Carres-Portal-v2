# PURCHASING — CARD 05 · MANUAL PURCHASE OBJECT DETAIL AND APPROVAL AUTHORITY

**Card path:** `docs/cards/CARD-2026-08-29-purchasing-05-manual-purchase-object-detail-and-approval-authority.md`
**Module:** Purchasing · **Sequence:** 05
**Page:** Manual Purchase
**Surface:** Full-width Manual Purchase object, approval decision and exact decision authority
**Status:** READY FOR BUILD — owner-approved 2026-08-29
**Lane:** BUILD / DELIVERY
**Depends on:** Card 04 production truth (`a1d11d53`), PR #982's one-decision-gate correction
(`45ee8691`) and the 2026-08-29 Purchasing/Receiving authority reconciliation on latest `main`
**Expected migration:** NONE — the decision door, actor/time fields and exact PO lineage already
exist. Stop and report before adding a migration; this Card authorises no new store or writer.

---

## 1 · Outcome

Turn the clicked Manual Purchase number into the approved Carres Object Detail template: one
full-width, calm, read-first object; one scroll; no tabs; no split preview; no narrow 720/900px
islands floating in an otherwise empty page.

Preserve PR #982's production correction: the screen no longer uses the broad daily-surface
`isOpsManager` compatibility answer. The shared `operation@carres.com` login sees neither money nor
`Approve` / `Refuse`; the database's `purchasing_decide_request` remains the enforcing gate; a
forced 42501 leaves as the governed `not_purchase_approver` two lines. Card 05 must carry that exact
authority into the rebuilt object without reopening it.

This Card does **not** create a second PO path. Approval makes the request eligible for Card 04's
Register selection; the selected action remains the sole Manual Purchase placement of PO Duty and
`Issue PO`. The resulting PO then belongs to `Purchase Orders` and the one shared `Receiving`
engine. There is no Manual Purchase receipt lane.

## 2 · Authority read and challenge

Read completely before build: `CLAUDE.md` · `docs/ERP-ARCHITECTURE.md` · `docs/ui/MASTER.md` ·
`docs/COPY-STANDARD.md` · `docs/ACTION-FLOW-STANDARD.md` · `docs/01-design-tokens.md` ·
`docs/02-components.md` · `docs/03-page-patterns.md` · `docs/purchasing/MASTER.md` · Cards 03/04 ·
the current Manual Purchase web/API/shared/SQL/tests · latest authority landed by the active SO
Batch Purchase and Operations Superuser work.

The old `.agents/skills/carres-design` file is superseded and points at a missing `docs/UI-KIT.md`.
Do not use it as design authority. The current authority is `docs/ui/MASTER.md` plus the three
frozen design files named above. The repository contains 2990 research summaries but not a current
2990 Manual Purchase object implementation to copy. Use the mature requisition lesson already
resolved in `docs/purchasing/MASTER.md`: internal approval and external PO are separate records;
copy capability, not terminology or layout.

| Current Carres | Mature lesson | Decision | Card 05 answer |
|---|---|---|---|
| Ad-hoc detail inside one large page component | An ERP object keeps identity, facts, decision and history in a stable reading order | **IMPROVE** | Use the locked Object Header + Summary + Sections + History template |
| `max-w-[720px]` / `max-w-[900px]` fragments | Read-first detail uses the available workspace and clear section structure | **REJECT** | Full-width sections; no floating form islands |
| PR #982 aligns `canApprove` to the SQL door's principal/real-duty facts | One permission must produce one answer at read and write | **KEEP + PROVE** | Reuse the strict answer; keep positive/negative contract tests |
| operation@ no longer sees approval controls | Superuser PO/Receiving authority is not purchase-approval authority | **KEEP** | operation@ stays read-only unless its real individual actor holds `ops_manager` |
| Approver sees request cost and may cut quantity | The approver needs cost and coverage before deciding | **KEEP + CLARIFY** | Approver-only cost; approved quantity starts at `Still needed` |
| Object contains another PO issue/consolidation surface | One demand may have many journeys, but one governed issuance placement and writer | **RELOCATE** | Issue only from Card 04's selected Register action |
| Raw loading/error strings and raw `forbidden` | A refusal states fact, then action, in plain official English | **IMPROVE** | Governed loading, empty and two-line refusal states |

## 3 · Exact object composition

Clicking `Manual Purchase No` opens WORK, not a PO preview and not a drawer. It replaces the
Register content while preserving the Purchasing shell.

```text
Purchasing shell
──────────────────────────────────────────────────────────────────────────────
‹ Manual Purchase     MPR-20260829-2779  [Waiting for approval]    4 of 69
──────────────────────────────────────────────────────────────────────────────

REQUEST
Requested Date   Needed By   Need for   For   Deliver To   Requested By

ITEMS REQUESTED
SKU   Item   Supplier   Requested Qty   Deliver To   Note

WHAT WE ALREADY HAVE
SKU   Free Stock   Already On PO   Still Needed

APPROVAL
Approval fact / real approver / approver-only cost and Approved Qty
                                                        [Refuse] [Approve]

PURCHASE ORDERS
PO No   Ordered Qty   Still To Order   PO Issued   PO Delivery Date

HISTORY
Today · Yesterday · Earlier
```

### 3.1 Object Header

- One owning-Register back destination: `Manual Purchase`. It restores the complete Register state
  the operator left, including rail filters, search, column filters, sort, scroll and expansion.
- One persistent identity: the actual `MPR-YYYYMMDD-RRRR`; historical identities print as stored.
- One derived state pill from `manualPurchaseStatusOf`.
- When position is known, show the filtered Register position (`4 of 69`) with previous/next
  keyboard-operable movement. Position is context, never another source of row truth.
- No duplicate `Back` button, page title, pseudo-tab, breadcrumb or PDF action.
- Rare/destructive object actions belong in the header overflow only when an already-governed door
  exists. This Card invents no new edit, delete, undo or take-back door.

### 3.2 Request

Show these authoritative facts in this exact reading order:

```text
Requested Date · Needed By · Need for · For · Deliver To · Requested By
```

`Requested By` is the real staff display name. Never print `operation`, an email, a role, `(you)`
or an invented person. A legacy shared-account record whose individual cannot be recovered reads
`Staff identity not recorded`.

`For` uses Card 04's one structured arithmetic. Routine purposes have no `Why`. A historical
pre-Card-04 reason remains visible under `Why`; `Other Purchase` displays its governed
`What is this for?` answer as the `For` fact.

### 3.3 Items requested

One read-only line table:

```text
SKU · Item · Supplier · Requested Qty · Deliver To · Note
```

Item uses Catalog human words while SKU remains explicit. Supplier is Catalog-derived and is never
selected or guessed here. A missing Catalog relationship is a named fact on the affected line and
links to its owning Catalog boundary; it does not become a Manual Purchase rail row.

### 3.4 What we already have

One compact fact table, using the same stock and open-PO reads already used by the request:

```text
SKU · Free Stock · Already On PO · Still Needed
```

`Still Needed = max(0, Requested Qty − Free Stock − Already On PO)`. Use the one shared arithmetic;
do not recompute it in the component. These are decision facts, not buttons and not Work rows.

### 3.5 Approval

The section always exists because approval history is part of the object. Its content changes by
fact and authority:

| Request fact / viewer | Approval section |
|---|---|
| No approval required | `No approval needed` only |
| Waiting · ordinary Operations viewer | `Need approval` + `{name} approves`; no money and no controls |
| Waiting · actual approver | Cost, approved quantities, `Refuse`, `Approve` |
| Approved | `Approved` + real actor + date/time + approved quantity per line |
| Refused | `Refused` + real actor + date/time + decision reason |

For an actual approver, show one line per live SKU:

```text
SKU · Requested Qty · Still Needed · Approved Qty · Transaction Cost · Line Total
```

- `Approved Qty` is prefilled once from `Still Needed`, not Requested Qty. Human edits are never
  overwritten by a background refetch.
- Each approved quantity is a whole number from 0 through Requested Qty.
- Transaction Cost and total are read-only approval evidence. They are not an Operation price
  control and do not create a second commercial-price writer. A later cost change is still governed
  at the one PO issue authority.
- `Refuse` reveals `Decision reason` in this section. It is required before the final `Refuse`
  can run. No routine free-text reason is added elsewhere.
- `Approve` is the one primary action in this section. `Refuse` is neutral.
- Jess may approve a request raised for Jess. This business-need approval is not the separate
  self-approval prohibition for a commercial price exception.
- Success stays on the same object, refetches authoritative facts, removes the controls and appends
  History. It does not throw the operator back to the Register.
- A decision is atomic and final under the current one-request/one-decision authority. This Card
  adds no re-decide or take-back control.

### 3.6 Purchase Orders

Read-only lineage from the request's real demand links:

```text
PO No · Ordered Qty · Still To Order · PO Issued · PO Delivery Date
```

- No PO: `Not ordered yet`.
- PO numbers are links to their exact Purchase Order object; several documents are separate rows.
- `PO Issued` is the actual issue timestamp and sits beside `PO No`.
- `PO Delivery Date` is the original supplier-facing PO date.
- A changed `Supplier Delivery Date` belongs to the PO/Receiving authority and may be shown here
  only when read from that exact linked PO; unchanged reads `Same as PO`.
- No `Issue PO`, consolidation offer, PO Duty, transaction-cost editor, Receive button, receipt
  quantity or PDF preview exists in this object. Card 04's selected Register action is the only
  Manual Purchase issuance placement. Physical arrival is opened through the exact PO in
  `Receiving`; this Card creates no receipt lane.

### 3.7 History

History is the final section in the one scroll. Group by `Today` · `Yesterday` · `Earlier` and use
the locked three-rank record grammar:

```text
Purchase approved
Jess · Principal · Sat, 29 Aug 10:42
2 requested · 1 approved
```

Include only events supported by authoritative stored facts: request created, purchase approved or
refused, remaining demand marked Not going ahead, and exact linked PO issue. Do not infer that a
supplier received a PO or that goods arrived from a button click. Real individual actor and actual
server time are required; `System` is used only when the event proves system authorship.

## 4 · One approval authority

### 4.1 Who approves

- `principal`, or an authenticated individual whose current real position holds `ops_manager`.
- Jess is the current configured approver and may approve a purchase for herself.
- Future managers are added through the existing organisation-duty setting; the page does not
  hardcode Jess.
- `operation@carres.com` and Jess remain Operations Superusers for the governed PO and Receiving
  doors. That does **not** give operation@ purchase-approval authority and does not bypass price or
  approval gates.
- The normal PO Duty person/cover remains Work ownership metadata, never the approval owner and
  never the only PO permission.

### 4.2 How read and write stay equal

PR #982 is the settled boundary and is not rebuilt in this Card:

- detail `canApprove` is true only for `principal` or the current authenticated individual's real
  `ops_manager` position duty;
- it never calls `isOpsManager` and never uses the legacy-email fallback;
- the same answer controls both approver-only money and `Approve` / `Refuse` rendering;
- `purchasing_decide_request` re-enforces the authority in SQL in the decision transaction;
- forced 42501 returns `not_purchase_approver`, with the resolved approver's name where available;
- actual `auth.uid()` remains the decision actor.

Card 05 may refactor this code only as needed to compose the new object, and only with the existing
positive/negative tests intact. If the capability cannot be resolved, fail closed: `canApprove:
false`, no money, no controls, server gate unchanged. Never guess true from role text, email, the
displayed approver name, PO Duty or Operations Superuser status. No migration is authorised.

### 4.3 Visibility matrix

| Capability | Ordinary Operations | operation@ shared login | Jess / actual approver | Principal |
|---|---:|---:|---:|---:|
| Open Manual Purchase object | Yes | Yes | Yes | Yes |
| See request, items, stock/PO coverage, decision fact and lineage | Yes | Yes | Yes | Yes |
| See approval cost | No | No | Yes | Yes |
| See `Approve` / `Refuse` | No | No | Yes | Yes |
| Submit approval decision | No | No | Yes | Yes |
| Use selected Register `Issue PO` when separately authorised | Governed PO door | Operations Superuser | Operations Superuser / governed PO door | Governed PO door |

This Card does not broaden who may enter the Operations portal and does not build a Sales Portal or
showroom request entrance.

## 5 · Refusal and UI words

Use PR #982's approved shared `not_purchase_approver` mapping; add only the remaining Object Detail
words to `docs/COPY-STANDARD.md`. The API returns `code` + Line 1 + Line 2. No raw PostgreSQL
message is rendered.

| Condition | Line 1 — fact | Line 2 — action |
|---|---|---|
| Caller is not the approver | `Only the approver may decide this purchase.` | `Ask {resolved approver} to approve or refuse it.` |
| No approver is configured | `No purchase approver is set.` | `Ask management to set the purchase approver.` |
| Decision already exists | `This purchase was already decided.` | `Reload the Manual Purchase to see the decision.` |
| Refusal has no reason | `The decision reason is missing.` | `Type why this purchase is not going ahead.` |
| Approved quantity is invalid | `The approved quantity is not valid.` | `Enter a whole number from 0 to {requested quantity}.` |
| Unknown refusal | `The decision was not recorded.` | `Reload the Manual Purchase and try once more. Tell IT if it happens again.` |

The named-approver sentence stays `{name} approves` / `{name} or {name} approves`. Do not show an
email, duty key, role label, `manager`, `operation`, `(you)`, `forbidden`, `42501`, `Pending`,
`Queue`, `Approve purchase request` or a generic `Something went wrong`.

## 6 · Work Engine boundary

This Card does not build or redesign central `My Work` / `Team Work`. It preserves the structured
facts needed by that engine: source MPR, trigger (approval required and undecided), owner rule
(`ops_manager`), resolved individual, completion (approved or refused), real actor and times.

The current authority does not yet define a governed approval due time or cover rule. Therefore
this Card must not create a local pseudo-task, deadline, `Late` label, queue, reminder, row Work
column or Manual Purchase worklist. A later Work Card must settle the Office-calendar due and cover
before `Approve the purchase` can become a complete Action Flow contract. The Register's factual
`Need approval` filter and `{name} approves` line remain valid and are not a second Work Engine.

## 7 · Absolute exclusions

- No change to Card 03's 240px rail or Card 04's 11 Register columns.
- No second `Issue PO` placement, PO writer, PO Duty block or consolidation prompt in Object Detail.
- No PO PDF preview, 50/50 split, supplier communication controls or document revision.
- No Manual Purchase receipt, `Receive`, GRN writer or Receiving-page redesign.
- No price edit by Operation; no bypass of commercial price approval.
- No tabs, drawer, right-side preview, duplicated page title, Back button, KPI cards or floating
  narrow form islands.
- No new purpose, free-text routine reason, supplier selector, SKU creator, manager page, report or
  Settings home.
- No edit/delete/re-decide/take-back invention and no mutation of applied migrations.

## 8 · Build boundary

Expected files are limited to the Manual Purchase object and the one approval authority seam:

- `apps/api/src/routes/operation/manual-purchase.ts` and focused API tests;
- `apps/web/src/pages/operation/OperationManualPurchase.tsx` and focused web tests;
- `packages/shared/src/manual-purchase.ts` or a focused Manual Purchase refusal dictionary, export
  and tests;
- `docs/COPY-STANDARD.md` and `docs/purchasing/MASTER.md` updated in place with the final authority;
- this Card's completion evidence after production verification.

Do not edit or reuse another task's SO Batch Purchase worktree. Before build, sync latest
`origin/main`, reconcile every Purchasing authority/migration landed by that task and the active
Operations Superuser branch, then work in a fresh isolated worktree.

## 9 · Acceptance

1. Clicking an MPR number opens the full-width one-scroll Object Detail with the exact section
   order in §3; no tab, drawer, split preview or empty right half.
2. The Object Header has one Register destination, one persistent MPR identity, one state and no
   duplicate Back control.
3. Ordinary Operations and operation@ see all permitted request facts, the real approver and no
   approval money/actions.
4. Jess/actual `ops_manager` and principal see approval cost, still-needed quantities and
   `Approve` / `Refuse`; Jess can decide a request raised for Jess.
5. PR #982's `canApprove`/decision-door contract remains proven for principal, real duty holder,
   ordinary Operation and operation@ negative control.
6. Approved Qty starts from Still Needed and accepts only whole 0..Requested values.
7. Refuse cannot submit without `Decision reason`; every refusal renders the governed two lines;
   `forbidden`, SQL text and role/email labels never reach the DOM.
8. A successful decision remains on the object, shows actual person/time/quantities/reason and has
   no remaining decision controls; a second decision is refused atomically.
9. Purchase Orders is read-only exact lineage with governed date words. No PO lineage is inferred
   from SKU/supplier/date matching.
10. There is no Object `Issue PO`, PO Duty, consolidation, price edit, Receive or PDF preview. Card
    04's selected Register action still reaches the one `purchasing_issue_pos_batch` authority.
11. Issued demand links to the exact Purchase Order and the shared Receiving engine; no new receipt
    route, store or writer exists.
12. History groups Today/Yesterday/Earlier and uses real individual actor, server time and stored
    result; no external outcome is inferred.
13. Card 03 rail and Card 04 Register remain byte-behaviourally unchanged outside the deliberate
    detail-entry/refetch wiring.
14. Focused shared/API/web regression tests, full repository test gates, typecheck, design-standard,
    migration CI, production build and `git diff --check` pass.
15. PR merges, the migration is applied in safe order, all production entry points converge on the
    exact merge SHA, and authenticated walks prove operation@ negative plus Jess positive at normal
    and narrow desktop widths.

## 10 · Required close-out review

The build chat must answer all four Action Flow review questions explicitly:

1. What in the authority contradicted the real code/data?
2. What would confuse a new hire?
3. What could not be implemented exactly as written?
4. What does the flow not cover?

Known at Card authoring: PR #982 has closed the previously measured approval render/write mismatch;
the current object still duplicates the Register's PO issue placement; the Work Engine has no
governed approval due/cover;
`docs/01-design-tokens.md` still says workspace rail 200px while the later approved SO Batch and
Manual Purchase authorities say 240px. Card 05 does not reopen the rail or silently fix that
cross-document token contradiction; report it to the owning UI authority task.

---

## 11 · Completion evidence — EXECUTED, 2026-08-29

**Status: SHIPPED AND PRODUCTION-VERIFIED.** PR #984, merged to `main` as
`a43de3b7556650a1cc323d31289eac1711ba6074`; no migration (tracker tail 0404, all applied by
the Superuser lane before this merge). All five canonical surfaces report the exact merge SHA
(`carres-portal` / `carres-pos` Pages, `erp.carresofficial.com`, `pos.carresofficial.com`,
`api.carresofficial.com/health`).

- **Gates.** Post-merge full suites green: shared 2,784 · api 2,575 · web 3,620 tests;
  typecheck; design-standard 0 new violations; migration CI; production build;
  `git diff --check`; PR CI `verify` pass.
- **Authenticated production walk (operation@ negative)** — live `MPR-20260829-2779` on
  `a43de3b7`: the full-width six-section object in the Card's exact order; Object Header with
  one back destination, the MPR identity, the state pill and `1 of 1`; `Requested By` reads
  `Staff identity not recorded` (shared-login record — a person is never invented); Approval
  shows `Need approval · Jess approves` with no cost and no Approve/Refuse; Purchase Orders
  reads `Not ordered yet`; History prints `Purchase requested` in the three-rank grammar;
  `‹ Manual Purchase` restored the Register.
- **Approver surface** — proven on the same SHA by the seeded dev walk (money, six-column
  decision table, Approved Qty prefilled from Still Needed, Refuse behind the required
  `Decision reason`) and by API contract tests (principal/real-duty positive, operation@
  negative, 42501 → `not_purchase_approver` naming Jess — PR #982's tests byte-identical).
  Jess's live positive walk (approve/refuse on a real request, including one raised for
  herself) is the owner's own 1-minute check.
- **Latent defect fixed in the same PR** — the register read selected
  `purchase_orders.po_no`, a column that does not exist on the live schema (the PO number IS
  `purchase_orders.id`); it would have 400'd the whole Register on the first issued MPR.

### The four close-out review answers (§10)

1. **Authority vs real code/data:** `purchase_orders` has no `po_no` column — the shipped
   Card 04 read and its tests assumed one; the schema says the id is the number. Fixed, and
   the MASTER now states it. Also: no store records the individual actor of a PO issue or a
   line cancel, so those History events can only say `Staff identity not recorded`.
2. **What would confuse a new hire:** `What We Already Have` reads open-PO cover live, so a
   fully-ordered request whose PO has arrived shows `Still Needed` again — the section is
   decision facts for approval, not order progress; the Purchase Orders section above answers
   progress. Worth watching on Jess's walk.
3. **Not implementable exactly as written:** `4 of 69` position requires the object to be in
   the operator's current filtered Register; a deep-opened or filtered-away object hides the
   position (the Card's own "when position is known"). The `Supplier Delivery Date` original
   date is reconstructed from the promise ledger's first held date — exact for every PO whose
   date moved through the governed doors, which is all of them.
4. **What the flow does not cover:** the Work Engine approval due/cover (deferred by §6); a
   re-decide/take-back door (deliberately not invented); the 200px vs 240px rail token
   contradiction in `docs/01-design-tokens.md` (reported to the owning UI task, chip raised);
   Jess's live approver walk.
