# HANDOFF — Carres Portal v2 · continuous build

Paste everything below the line into a fresh session. It is self-contained.

> **`docs/handoff/` HOLDS EXACTLY ONE LIVE PROMPT, AND THIS IS IT.** When this lane's mission
> changes, OVERWRITE this file — never add a second one beside it. Git history keeps the earlier
> checkpoints (`git log -p -- docs/handoff/CARRES-CONTINUOUS-BUILD-HANDOFF.md`). Re-measure every
> SHA and status below before trusting it.

---

CARRES PORTAL v2 — CONTINUOUS BUILD · checkpoint 2026-10-15 day (UI kit lane)

## 0 · Owner scope carried forward (Jess, 14 Oct 2026 — do not ask her to reconfirm)

1. One existing UI kit across the whole Portal; remove superseded implementations after preserving
   recoverable work (Git history or a named branch), in the same change.
2. Complete Sales Order, SO Batch, Workspace and Tasks, including source links and task completion.
3. Merge, deploy and verify approved scope when the required gates pass. Unapproved previews stay
   outside a release.
4. Keep every later module on the same kit, Workspace/Tasks and the Settings it needs.

Controller round 2 (15 Oct, with Jess's "table line" screenshots): park the opened-row frame
question (UI MASTER §6.9 governs the connector) and continue; type by governed role, never a blind
11px swap; Tasks need runtime proof, writes only in an authorised test environment; SO Batch brief
conflicts as rule → change → consequence → recommendation; migrate approved legacy SO capabilities
without asking Jess to discard them; record access gaps instead of bypassing permissions.

Never report progress as a percentage; list the exact remaining obligations (§4).

## 1 · Where the work is

- Repo `wenwei4046/Carres-Portal-v2` is PUBLIC: never commit customer data, real-looking names or
  the design package's `sales-real.js`.
- Worktrees: `~/carres-worktrees/*` (merged ones are safe to remove). The Desktop checkout is
  `desktop-main` with someone else's uncommitted files: do not touch them.
- Branch `preview/two-row-toolbar` (= `b7c7c3a01`) keeps the unapproved two-row toolbar candidate.
- Production: `erp.carresofficial.com`, `pos.carresofficial.com`, `api.carresofficial.com/health`;
  read `/__carres_deploy.json` before quoting a SHA. A merge to `main` deploys all three.

## 2 · Completion table (one table; re-measure before quoting)

Production runs `7f4f7dd34` (ERP, POS and API manifests read 15 Oct 2026 after deploy run
`38695863784` succeeded). **Batch B is merged PR #2083
(`build/kit-batch-b`, head `b664e6512`)**: local gates all green (lint, typecheck, 478 test files /
7,013 tests, kit check 74/74), 42 retaken pictures committed. CI `verify` passed on exact head
`b664e65127cfc96179d37435df23d7f6c6f4ab31` at 14:59:47 MYT. Squash-merged with
`--match-head-commit` at 15:00:09 MYT as `7f4f7dd340858e64afe04be16375b3754e629632`.
ERP/POS `/__carres_deploy.json` and API `/health` all reported the full merge SHA.
Authenticated production `carres-check.js` from that exact SHA: **18/18 PASS**, at
1025 · 1164 · 1440 on Sales Order SO-1254, Purchase Orders, Inbound, the existing Manual Purchase
listing, Delivery Orders and Finance Payment Records (`/finance/payments`, permitted for Operation).
Records were loaded before measuring; the browser was already signed in as Shasha, no password
entered. SO-1254's previous 37px item row/model-spec-on-one-line findings disappeared: header 40,
item and total rows 44, model and spec on separate lines; Inter loaded, no page overflow.
These are the requested measurement checks, not proof of every interaction or every Finance-only page.
The concurrent #2085 handoff update additionally records Outright, SO Batch and Receiving PASS
at all three widths, Forecast/Workspace PASS at 1025 and Payment Monitor PASS at 1440; those
additional checks were not repeated by this chat. It reports a known short-toolbar defect:
SO Batch `View: By sales order` is cut by 15px at 1025 with Tasks open (433 available, 448 needed),
tied to the pending presentation decision (§5). Preserve that finding.
**Batch B2** (`build/kit-batch-b2`, `6c6b99f09`, not a PR yet): Finance
read failures say `Could not read …`, no `refund_pay` on screen, Payment Monitor ref line grey — ships
with the next functional release, not on its own.

| Area | Deployed (PR · SHA) | Runtime-verified | Unfinished |
|---|---|---|---|
| Batch B release | #2083 `7f4f7dd34`; exact-head CI and deploy succeeded | Six requested production pages × 1025 / 1164 / 1440: 18/18 carres-check PASS | Owner acceptance; other module journeys and denied Finance-only lists are not covered by this measurement pass |
| One listing engine | v12 look #2071 `a6c6eabc9` · one ⋮ Page tools #2074 `241209c68` · whole table lines #2077 `ddd0edf0d` · Outright on the engine, CTable deleted #2079 `2a28f84d9` · engine group rows/chips 12/500 #2080 `cfa0ae0dc` | Production 15 Oct: table lines whole on Outright (last row too, no rounded rows), SO Batch last row, Forecast band; every list header 40 | Opened-row frame on lists other than Outright (owner, UI MASTER §7.2); Finance-only lists not readable with the available login; permitted Payment Records measured on #2083 |
| Shared parts | one menu #2070 · one pop-up #2072 · one pill drawing #2073 · one segmented control #2078 `4903bead6` · pill weight 500 only and Inbound site switch #2080 `cfa0ae0dc` | /ui computed equal; menus and pop-ups by keyboard in production | Summary panel only on Outright; Batch B deployed procurement/PO object segmented tabs and initials 11/700, full object-tab interaction walk still owed |
| Type to 01 §2 (by role) | Delivery, Warehouse, Stock + rail, caps labels, pills, side menu group word #2078 `4903bead6` · SO detail, Order Route, Delivery brief, reorder card, Purchasing, Receiving #2080 `cfa0ae0dc` | Production carres-check at 1025 · 1164 · 1440 on `4903bead6`: Delivery Orders, Delivery Monitor, Outbound, Inventory, SO Batch, Outright PASS; Inbound 2 findings (fixed in #2080). On `cfa0ae0dc`: Purchase Orders and Receiving PASS at 1025 · 1164 · 1440; Inbound PASS at 1440 and its Site switch ran off at 1025/1164 (wraps in #2081); Manual Purchase only the screen-reader `+` (#2081); SO page leftovers are field rows 33 vs 36, item rows 37 vs 44, model · spec on one line, its own items table (01 §5 order-line table owed) and initials 10/700 (#2081) | Batch B deployed remaining Operation, Finance, Principal, Supplier and HR type sites; six-page runtime measurement is in the Batch B row, other portal journeys still owed. Legacy old-orders is excluded; `sales-order-route.ts` text budget assumes 11px |
| Sales Order (Outright) | page 1 #2066 · Monthly demand door #2075 · engine + approved capabilities #2079 `2a28f84d9` | Production 15 Oct on `2a28f84d9`: carres-check PASS at 1025 · 1164 · 1440, rows closed and open; header 40, rows 54, footer `31 orders · Qty: …`; Group by Payment Status (Unpaid 1 · Partially paid 26 · Paid in full 4); sort SO no. both ways; Stock view PO numbers are links; row menu View · Print · Cancel SO (not clicked); tick `Select SO-1371`; chevron `Show items`; opened-row frame 1px `#CBD0D6`, corners 8, items Item · Qty · Supplier; SO no. stays in view at the right end | Owner walk; short-toolbar decision; SO quick card has no entry point (§5) |
| SO Batch Purchase | v12 look via the engine · one ⋮ · PO No comma fix · header 40 | Production PASS at 1025 · 1164 · 1440 (15 Oct) | A confirmed: existing deadline rule retained; B/C owner rulings pending (§5); D rejected; E reported (§6) |
| Workspace | Round 3 + `+ Task` (#2044–#2055) | Production read-only 15 Oct: feed 206 items, UI 193 (13 future on-day deliveries), each destination opens the exact record, reload keeps the same ids and module counts | Signed-in owner walk |
| Tasks | One feed `/api/operation/work?include=workspace`; no page writes tasks locally | Local replayed database 15 Oct (fixture users, nothing in production): internal task add → same id on retry → in the open feed (real `projectInternalTaskWork`: id `workspace:{task}:internal_task`, destination `/operation?tab=work&task=…`) → mark done on the same record (events added, done) → gone from the open feed; the Work ledger refuses completion except by the owning module's fact and needs a contact with a contact kind | Module task completion end to end: owner authorised the one SO-1254 TEST write; current source UI has no no-date answer entry (§4.2), so no write or closure is claimed |

Engine decision (evidence 15 Oct 2026): `register/DataGrid` is the one listing engine; every list,
Sales Order Outright included since #2079, passes `appearance="reference"`. `carres/CTable`, the
unrouted `SalesOrdersRegister.tsx` and `DestinationHeader.tsx` are deleted (UI MASTER §7.7 lists
what moved, what an owner ruling replaced, and the kept `SalesOrderCompactView`).

## 3 · Checks and how to rerun them

- Web: `cd apps/web && npx tsc -p tsconfig.app.json --noEmit`; tests with
  `npx vitest run <dirs> --poolOptions.threads.minThreads=1 --poolOptions.threads.maxThreads=4`
  (plain `--maxWorkers=4` errors out and runs nothing). `pnpm lint` before pushing (row-height and
  hex guards).
- Kit: `KIT_BASE_URL=http://localhost:<port> npx playwright test --config playwright.kit.config.ts
  --grep-invert baseline` against `pnpm --filter @carres/web exec vite --port <port>`. Do not edit
  code while it runs (a reload fails a case). Baselines are Linux pictures: add the PR label
  `update-baselines` (remove and re-add it to retake after a push), download the artifact
  (`gh run download <id>`), commit only pictures with real pixel changes.
- **CI renders two anti-aliasing variants** on rounded edges at fractional x; the 0.2 % gate absorbs
  them. A byte change with no pixel over 16 is not committed.
- Two open PRs that both retake pictures: merge one, merge `main` into the other (no force push),
  retake, commit.
- Production read: browser pane, own background tab, `resize_window` per width; `carres-check.js`
  from raw GitHub at the deployed SHA. Reset the viewport after.
- Local database for writes: `LC_ALL=C node scripts/dry-run-migrations.mjs --keep` (fixture users
  `…f001`–`…f004`; impersonate with `set_config('request.jwt.claim.sub', …)`).

## 4 · Remaining obligations, as delivery batches (controller 15 Oct: batch, no CI cycle per small fix)

1. **Batch B · DELIVERED #2083 `7f4f7dd34`; requested six-page measurement pass complete.** Three parts built in
   parallel, merged into one branch, one CI, one deploy, one production check at 1025 · 1164 · 1440:
   (a) `build/kit-ops-finish` — remaining Operation pages by role (Delivery Order page, Delivery
   report/settings, Payment settings/templates, Movements, Calendar rail, timelines, Work right
   panel cards) + procurement and PO object view tabs onto the kit segmented control + GoodsMiniTable
   headers; (b) `build/so-page-items` — the Sales Order page's Items card on the 01 §5 order-line table
   (rows 44, model then spec) and field rows 36; (c) `build/kit-portals-type` — Finance, Principal,
   Supplier portal, HR and shared components by role. Excluded on purpose: the legacy old-orders page
   (not in the side menu; retires at go-live).
2. **Batch C · Tasks end-to-end proof (functionality).** Jess authorised this ONE TEST write in
   `Deploy PR #2083 and verify UI` on 15 Oct 2026: record the
   `not yet` test answer on trial order SO-1254 through the Sales Order page and watch its open
   `Ask for the delivery date` task (`orders:c1e95bf2-…:ask_delivery_date`, owner Alvin) leave the
   feed with a closure receipt. No test database exists here (no Docker or PostgREST); the internal
   task path is already proven on a local replayed database. No production test write has been
   made. Preflight on `dabffcfc5`: the exact task is open in Team Work, owner Alvin; its door opens
   the full SO page, which has no legacy `not yet` entry. Current `SalesOrderWorkspace.tsx`
   only picks a real date and clears `delivery_date_tbd`; `ConfirmDateModal` was removed in
   #1325 as unrendered. `POST /api/orders/:id/date` still exists (a real-date writer), as does the
   Operation revision writer's `ask_delivery_date` completion middleware. Rechecked on deployed
   `7f4f7dd34`: Request amendment → Edit Customer new delivery date offers only a real-date picker,
   no no-date answer. No field changed; cancelled with zero changes. **REAL GAP:** Orders MASTER
   retains legacy no-date work, while its 2026-09-26 edit ruling prohibits a TBD checkbox and says
   a date changes only into another date. Reconcile a source-owned legacy answer door with that
   restriction; do not silently reintroduce TBD for dated or new orders.
   Do not bypass the page with a direct production write or report this TEST answer as real
   customer communication. Owner authorisation is satisfied, runtime proof is not.
   Controller-directed read-only reconciliation (15 Oct): the live row has no delivery date,
   `delivery_date_tbd=false`, unfinished `place` status, and predates the 15 Aug entry gate. It
   meets `work.ts`'s current `askDeliveryDate` predicate and Orders MASTER's legacy eligibility;
   do not remove it as stale solely because a response writer is absent. The live revision writer
   retains `promise_moves_by_amendment`; the UI requires a real date for non-contact edits.
   No TBD checkbox, bypass, date clearing, writer change or task-semantic change is authorised.
   Controller proposal: prove the existing real-date/amendment contract on an isolated fixture;
   supporting a legacy no-date response writer would need an explicit scoped policy ruling.
3. **Batch D · SO Batch brief.** A confirmed: preserve the existing deadline rule, no code change.
   B and C still await owner rulings via the controller (§5); batch any approved changes into one release.
4. **Page adoption down the side menu** after Design's fix list per page; **Settings per module** at
   completion (owner 2026-10-05).

## 5 · Owner/design decisions (controller confirms with Jess, then replies to Code; one at a time)

- Short toolbar: one line (built, recommended) vs two rows (`preview/two-row-toolbar`).
- Opened row: v12 frame vs §6.9 connector (UI MASTER §7.2; the engine can draw the frame,
  Outright uses it; recommendation: v12 frame on every list).
- List header case portal-wide (UI MASTER §7.2; recommendation: sentence case, as v12).
- SO quick card (`SalesOrderCompactView`) has no entry point since row click opens the full SO:
  give it a door or retire it (Sales Order lane).
- Tasks title row: 01 §4 names `Log call`, which is not a COPY word; the Portal shows `+ Task`.
- Earlier lane, still open (2026-09-14 Payment checkpoint): the sentence `Nobody holds Delivery
  Duty.`; a permanent home for the assignment pool; the pooled test account `operation-test@x.com`.

### SO Batch design brief 14 Oct (Round 4 `Code briefs/2 SO Batch Purchase.md`) — owner rulings needed

**A · `Order PO deadline` on a group row — CONFIRMED 15 Oct 2026, no code change**
- Jess confirmed through `Create Claude design checklist`: keep the earliest Order By among
  outstanding lines, including an already overdue unpurchased line. Each line keeps its own deadline.
- Reject replacing it with the nearest non-late date. A future date must not hide buying already late.
- Trial-data age is not a reason to change the rule. Purchasing MASTER §9.1 remains the authority.

**B · `Status` on a group row**
- Existing rule (§9.1): "`Cut-off passed` (amber) with what is still to buy, when a line's PO window has gone by; otherwise `To buy`."
- Proposed: `Cut-off passed` only when every open line is past its cut-off; otherwise `Order now` when anything is due today or late.
- Consequence: a group with one passed line and nine on time reads `Order now` instead of `Cut-off passed`; `Order now` is not a COPY word (COPY status words: `To buy` · `Cut-off passed` · `Late to order` · `Partly ordered` · `Ordered` · `From ready stock`).
- Recommendation: keep `Cut-off passed` when any line's window has passed (it is the fact the buyer must act on today), and use the existing `Late to order` when the Order By date has passed; reject `Order now`. Falsifier: Jess rules the group status must describe the majority of its lines.

**C · Today card numbers**
- Existing rule (§9.1 rail): `To order now` = still to buy after its PO window has gone by; `Past the order-by date` = lines whose Order By date has passed. Two different clocks (window cut-off vs Order By date), so 46 and 47 pcs are both correct and need not add up.
- Proposed: `To order now` = `Past the order-by date` + due today, and the numbers must add up on screen.
- Consequence: `To order now` changes meaning from the PO-window clock to the Order By clock.
- Recommendation: keep both definitions (they are different facts) and make the card follow 01 §4 "one headline tile with its breakdown rows under it": headline `To order now`, breakdown rows that sum to it (`Window passed` + `Due today`), with `Past the order-by date` as its own row outside the sum. Falsifier: Jess rules there is only one clock for "now".

**D · `Create PO` task per supplier** — rejected word (COPY: the page asks `Review PO`/`Issue PO`); the PO window Work card already exists and goes to the PO Duty holder. No change.

**E · July SOs with no PO** — report only; needs read of the live rows, no change.

**E · data check, read-only (production read 15 Oct 2026, nothing changed).** The brief's named orders are not missing POs: SO-1203 is on PO-20260903-6426 and -7907, SO-1205 on -4316, -4585, -7907 and -9389, SO-1208 on -8059 (all `open`, made 3 Sep). Orders proceeded in July with goods lines on no PO: SO-1204, 1206, 1207, 1210, 1212, 1213, 1216, 1254, 1283, 1284, 1287 (1206 and 1216 `proceed_order`; the other nine still `place`). All were created 21–31 Jul 2026 in the portal trial; their delivery dates (4–31 Aug) have passed and none has a Delivery Order. Under CLAUDE.md §6 every row is TEST data and none carries over at go-live, so no SO is closed and no PO raised; the July `days late` on SO Batch is trial data, not a missed purchase.


Do NOT ask Jess again about `· passed` or any decision already recorded in COPY or a MASTER.
Do not start Manual Purchase Request business work (Design review resumed 15 Oct, Q1–Q4 open).

## 6 · Data truth, access gaps and unverified items

- No order row is proven genuine business data (CLAUDE.md §6): `AutoCount Archive` imports,
  `rental`, test names (SO-1340, 1339, 1333, 1328), SKU `MEMORY-FOAM-PILLOW-asd`.
- Access gap: the signed-in production login (Logistics · Carres HQ, Operations) cannot open Finance-only
  lists. Shasha can open Payment Records (`/finance/payments`): 12 payments loaded and the three
  widths passed on #2083. Other Finance-only pages remain fixtures/tests only. Not bypassed.
- UNVERIFIED: PO review permissions; SO amendment writes; long product names on SO item rows;
  Design interactions not exercised. Never manufacture records, impersonate Jess, approve or issue
  a PO to test.

## 7 · Shared kit sources (one kit)

`components/carres/` (CCell + CListFooter for list cells and footers, CToolbar, CPopover + CMenu,
CSidePanel, CPill, MIcon) · `components/kit/` (Button, fields, Modal, Drawer, Tabs and the one
segmented control, states, documents, CompactModuleCard, task parts) · `components/Segmented`
(draws the kit segmented control) · `components/register/DataGrid` (the one listing engine) ·
`/ui` · 01 / 02 / 03 · UI MASTER §0 and §6.0 · checks
`docs/ui-reference/sales-order-design/carres-check.js` and `carres-align.js`.

## 8 · Restart message

`Carres UI kit lane — CONTINUOUS BUILD. Read CLAUDE.md, docs/ui/MASTER.md "How design and Code
work" and §7, and docs/handoff/CARRES-CONTINUOUS-BUILD-HANDOFF.md. Start at §4.1 and follow §4 in
order; bring only §5 decisions to the owner, one at a time. Do not start Manual Purchase Request.`
