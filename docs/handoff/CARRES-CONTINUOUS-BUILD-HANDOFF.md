# HANDOFF — Carres Portal v2 · continuous build

Paste everything below the line into a fresh session. It is self-contained.

> **`docs/handoff/` HOLDS EXACTLY ONE LIVE PROMPT, AND THIS IS IT.** When this lane's mission
> changes, OVERWRITE this file — never add a second one beside it. Git history keeps the earlier
> checkpoints (`git log -p -- docs/handoff/CARRES-CONTINUOUS-BUILD-HANDOFF.md`). Re-measure every
> SHA and status below before trusting it.

---

CARRES PORTAL v2 — CONTINUOUS BUILD · checkpoint 2026-10-15 night (UI kit lane)

## 0 · Owner scope carried forward (Jess, 14 Oct 2026 — do not ask her to reconfirm)

1. One existing UI kit across the whole Portal; remove superseded implementations after preserving
   recoverable work (Git history or a named branch), in the same change.
2. Complete Sales Order, SO Batch, Workspace and Tasks, including source links and task completion.
3. Merge, deploy and verify approved scope when the required gates pass. Unapproved previews stay
   outside a release.
4. Keep every later module on the same kit, Workspace/Tasks and the Settings it needs.

Never report progress as a percentage; list the exact remaining obligations (§4).

## 1 · Where the work is

- Repo `wenwei4046/Carres-Portal-v2` is PUBLIC: never commit customer data, real-looking names or
  the design package's `sales-real.js`.
- Worktrees: `~/carres-worktrees/{so-outright-kit, one-kit-ui, engine-v12, kit-retire, kit-docs}`.
  The Desktop checkout is `desktop-main` with someone else's uncommitted files: do not touch them.
- Branch `preview/two-row-toolbar` (= `b7c7c3a01`) keeps the unapproved two-row toolbar candidate.
- Production: `erp.carresofficial.com`, `pos.carresofficial.com`, `api.carresofficial.com/health`;
  read `/__carres_deploy.json` before quoting a SHA. A merge to `main` deploys all three.

## 2 · Done (each with its proof)

| PR | What | State |
|---|---|---|
| #2066 `41bc9a6d3` | Sales Order Outright page 1 on the v12 kit (one-line toolbar; the two-row candidate moved to its branch) | DEPLOYED. Production read 15 Oct: `carres-check.js` PASS at 1025 (panels off · Summary · Tasks), 1164 (same three), 1440 (both open); page side scroll 0; toolbar overflow 0; footer `31 orders · Qty: Mattress 23 · …`; Supplier SO-1371 B1201S-K Nice Future · SO-1363 TRION-Q Ohana, CODY-SK Ohana, pillow `Not recorded` · SO-1362 JAGER-SS Ohana · SO-1340 H1401F-K Nice Future (TEST/trial orders) |
| #2070 `ece6de740` | One menu: kit `DropdownMenu` retired into `CMenu` (CPopover menu, items as data; Enter/Space/↓ open on the first enabled command); `/ui` shows every shared part pages import, with page counts | DEPLOYED. Production read: SO Batch ⋮ Page tools opens on Enter with focus on the first enabled command, Escape closes and returns focus; `/ui` 18 sections, DataGrid present |
| #2071 `a6c6eabc9` | The list engine draws the v12 table for every list: header band `#F8F9FA`, 10 between columns with 14 at the edges, ▸ before ☐, 24 round chevron; four page-local padding patches removed; 30 baseline pictures retaken on Linux | DEPLOYED. Production read 15 Oct: SO Batch By supplier 1025 and All 1164 (rows closed and one open, 25 item rows), By sales order All 1025 (▸ ☐ order, `expand_more` when open, 6 item rows), Forecast 1164 (item tick 0.2 px under the row tick), Purchase Orders 1440 (62 rows), Workspace Team 1440: `carres-check.js` PASS, header `rgb(248,249,250)`, no page side scroll. Finance lists not read on production (this login has no Finance access); their look and padding are unchanged by code |
| #2072 `bd54355c1` | One pop-up (kit `Popover` merged into `CPopover`, which gained the dialog container); `Card`, `GridToolbar`, `ChecklistRow`, `QuietRouteRow` deleted (no page drew them) | DEPLOYED. Production read: Purchase Orders column filter menu and the top bar team pop-up open (`data-kit="popover"`) and close with Escape |
| #2073 | One pill drawing: `CPill` reads `StatusPill`'s shape and colour pairs (computed identical on `/ui`) | open, see §4.1 |
| #2074 | Every Register list keeps Export and Columns in its one ⋮ Page tools menu (46 lists drew the rejected separate buttons); `PO No` lists keep each comma with its number | open, see §4.1 |
| #2075 | Monthly demand's month door (`/operation/orders?tab=all&requested=…`) narrows Sales Order Outright again, with a chip that clears it; one shared `requested-narrowing.ts` | open, see §4.1 — a live defect since Outright took `/operation/orders` |

Engine decision (evidence 15 Oct 2026): `register/DataGrid` is the one listing engine — 56 page
importers and every one passes `appearance="reference"`; its stylesheet named Sales Order Outright as
the finished v12 reference. `CTable` (Outright only) is the one exception; UI MASTER §7.7 lists what the
engine must take before Outright moves onto it.

Workspace and Tasks (code read 15 Oct): every Tasks surface reads the one server feed
(`useOperationWork`, one query key, `/api/operation/work?include=workspace`); no page writes task
data locally, so opening another page cannot overwrite tasks. Round 3 (#2044–#2053) and `+ Task`
(#2055) are live and were checked signed in on 13–14 Oct.

## 3 · Checks and how to rerun them

- Web: `cd apps/web && npx tsc -p tsconfig.app.json --noEmit`; tests with
  `npx vitest run <dirs> --poolOptions.threads.minThreads=1 --poolOptions.threads.maxThreads=4`
  (plain `--maxWorkers=4` errors out and runs nothing). Full parallel runs time out under load.
- Kit: `KIT_PORT=<free> npx playwright test --config playwright.kit.config.ts --grep-invert baseline`.
  Baselines are Linux pictures: add the PR label `update-baselines`, download the artifact
  (`gh run download <id>`), commit the intended pictures only.
- **CI renders two anti-aliasing variants** on rounded edges at fractional x (proved on 6 runs incl.
  `1d58ff552`); the 0.2 % gate absorbs them. A small spread difference on an untouched page is not a
  code change and is not committed (15 Oct: sales-order 1164 Tasks-on, 584 px, 0.06 %).
- Production read: browser pane signed in on `erp.carresofficial.com`; `resize_window` per width,
  set `carres.outright.summary` / `shell-tasks-open`, reload, fetch `carres-check.js` from raw GitHub
  at the deployed SHA and `eval`. Remove the two keys after.

## 4 · Remaining obligations, in order (next executable step is 4.1)

1. **Land #2073, #2074, #2075**: CI green on each head → squash merge → deploy → production read
   (a Finance list and a Delivery list show one ⋮ with Export and Columns; Monthly demand → a month
   opens Outright with the chip; a two-PO cell on SO Batch By sales order wraps without a lone `,`).
2. **Outright onto the engine, then delete `CTable`** (UI MASTER §7.7): pager footer, widen-to-content
   columns, URL-driven header value filters, page toolbar in the engine's slots; opened-row frame after
   §7.2 is decided. Acceptance: 12 sales-order baselines unchanged, `kit-outright.spec.ts` green.
3. **One pill**: `StatusPill` (19 pages) and `CPill` draw the same tokens; make one the renderer.
4. **Old `SalesOrdersRegister.tsx`** is unreachable. Capability check done 15 Oct (UI MASTER §7.7):
   Outright lacks grouping, per-column sort, the Columns chooser, the role money default, the
   Monthly demand view, the URL filters (`dealer` `state` `city` `delivery` `category` `stock`
   `payment`), Cards, the quick card, the row menu `View · Print · Cancel SO`, clickable PO/DO/
   Receipt/Invoice numbers and money footer totals. Each is either moved into Outright through
   Design's fix list or dropped by the owner; only then move `skuKey`, `useCatalogNames`,
   `paymentStatusOf` out and delete the old page and its two test files.
5. **Page adoption down the side menu** after Design's fix list per page (UI MASTER "How design and
   Code work"): Receiving, Delivery, Warehouse, Payments still use the older rail and toolbar.
6. **Settings per module** at completion (owner 2026-10-05).

## 5 · Pending owner/design decisions (bring only these, one at a time)

- Short toolbar: one line (built, recommended) vs two rows (`preview/two-row-toolbar`).
- Opened row: v12 frame vs §6.9 connector (UI MASTER §7.2; recommendation: v12 frame).
- List header case portal-wide (UI MASTER §7.2; recommendation: sentence case, as v12).
- SO Batch design brief 14 Oct (`Sales Order (16).zip`, `Code briefs/2 SO Batch Purchase.md`):
  A (group row shows the next date, not the earliest) and B (`Cut-off passed` only when every line
  passed) change Purchasing MASTER §9.1 `Order PO deadline` / `Status` definitions → owner ruling;
  C (`To order now` = past order-by + due today) changes the Today card's arithmetic → owner ruling;
  D (`Create PO` task per supplier) uses a rejected word; the PO window Work card already exists and
  goes to the PO Duty holder (monthly rotation, an Operations person — not Jess's own Tasks list);
  E is a report only.
- Tasks title row: 01 §4 names `Log call`, which is not a COPY word; the Portal shows `+ Task`.
- Earlier lane, still open (2026-09-14 Payment checkpoint): the sentence `Nobody holds Delivery
  Duty.`; a permanent home for the assignment pool; the pooled test account `operation-test@x.com`.

Do NOT ask Jess again about `· passed` or any decision already recorded in COPY or a MASTER.
Do not start Manual Purchase Request business work (Design review resumed 15 Oct, Q1–Q4 open).

## 6 · Data truth and unverified items

- No order row is proven genuine business data (CLAUDE.md §6): `AutoCount Archive` imports,
  `rental`, test names (SO-1340, 1339, 1333, 1328), SKU `MEMORY-FOAM-PILLOW-asd`.
- SO-1340: 14 open, unsent, version-1 POs source one qty-1 line (read-only finding).
- UNVERIFIED: PO review permissions; SO amendment writes; long product names on SO item rows;
  Design interactions not exercised. Never manufacture records, impersonate Jess, approve or issue
  a PO to test.

## 7 · Shared kit sources (one kit)

`components/carres/` (CTable until §4.2, CToolbar, CPopover + CMenu, CSidePanel, CPill, MIcon) ·
`components/kit/` (Button, fields, Modal, Drawer, Tabs, states, documents, CompactModuleCard, task
parts) · `components/register/DataGrid` (the one listing engine) · `/ui` · 01 / 02 / 03 · UI MASTER
§0 and §6.0 · checks `docs/ui-reference/sales-order-design/carres-check.js` and `carres-align.js`.

## 8 · Restart message

`Carres UI kit lane — CONTINUOUS BUILD. Read CLAUDE.md, docs/ui/MASTER.md "How design and Code
work" and §7, and docs/handoff/CARRES-CONTINUOUS-BUILD-HANDOFF.md. Start at §4.1 and follow §4 in
order; bring only §5 decisions to the owner, one at a time. Do not start Manual Purchase Request.`
