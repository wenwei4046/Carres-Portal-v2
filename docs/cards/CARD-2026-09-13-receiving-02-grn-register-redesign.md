# 【RECEIVING】 — CARD 02 · GRN Register redesign, exception evidence, GRN detail

- **Module / surface owned:** Receiving — the `Purchasing → Receiving` destination (GRN Register,
  rail, two-month expected-arrival calendar), the GRN object (50/50 record/document), the
  exception-evidence store and viewers, and the shared kit powers this card adds
  (`MonthCalendar` two-month display, `GoodsMiniTable` receiving layout, `DataGrid`
  `hideClearFilters`).
- **May NOT touch:** PO issue/commercial flow, Sales Orders, Delivery, Payment, Stock's own
  transfer/count doors, Supplier Claim decision layers, Manual Purchase pages, the Warehouse
  count modal's business rules (it gains only the optional video/extra evidence keys).
- **Lane:** BUILD/DELIVERY under the owner's 2026-09-13 instruction. **This prompt authorises
  implementation and NON-production verification only — no merge, no deploy, no production
  migration apply.** The result is prepared for owner review.
- **Branch:** `build/receiving-grn-redesign` from `origin/main` `b8dab48d`.
- **Design references named by the instruction:** `receiving-review/CLAUDE-HANDOFF.md` and
  `receiving-review/receiving-proposal.html` (11 Sep 2026 prototype, 13 Sep handoff control).
  **NOT FOUND** — not in this repository, any of its 100+ worktrees, any remote ref, the other
  Carres clones on this machine, nor anywhere under the home directory (name and content search).
  Commit `e8553d0f` and a Receiving migration `0480` are likewise absent (`0480` in this repo is an
  unrelated open PR #1234). Nothing was substituted: the build follows the instruction's own
  written specification (§§2–9) plus the repository authorities, and every place that depended on
  the prototype is labelled in the delivery matrix.

## Requirement matrix — BEFORE implementation (2026-09-13)

| # | Requirement | Current gap (measured on `origin/main` b8dab48d) | Governing decision | Target component / file | Acceptance check |
|---|---|---|---|---|---|
| R1 | Default columns exactly `Expand · GRN No · GRN Date · Supplier DO No · Supplier · PO No · Items · Received Qty · Exceptions · GRN Status` | 14 default columns (`OperationReceiving.tsx:211-495`); no GRN Date, Items, Exceptions; `Product` prints `product_skus.variant` alone (`Super Single`) | Instruction §3; UI MASTER §6.5 density; Law D one arithmetic | `OperationReceiving.tsx` columns + `storageKey` bump; API `?scope=grn` gains `grn_date`, `items`, totals, labels | Page test asserts the exact default order and that secondary facts are `defaultHidden`; API test asserts the new fields |
| R2 | Expanded columns `Item · Received · Damaged · Wrong Item · Extra`; full real name (`Model · Variant` + PO-line configuration); no SKU column; only this GRN's counted lines; Received excludes damaged/wrong/extra | No expansion exists; name resolution is variant-only | §3; ui MASTER §6.8 (the ONE child table); `resolveSkuLabels` grammar (`Model · Variant`) already used by Orders/Stock/Claims | `GoodsMiniTable.tsx` gains `receivingLayout`; API resolves `item_label` (snapshot first, catalog fallback flagged); validator snapshots `item_label` at posting | Page test: expansion renders the five heads, the full name, no SKU head, only counted lines; shared test for the label ladder |
| R3 | GRN Status `Confirmed` / `Cancelled` mapped to `posted` / `voided` | Prints `Valid` / `Cancelled` | §3 later decision overrides the 2026-09-06 `Valid` word; internal states unchanged | `@carres/shared warehouse-receipt.ts` status label; COPY-STANDARD; MASTER §9.4 | Shared test; source scan finds no `Valid` on Receiving surfaces |
| R4 | CO flows preserved and identified; never relabel a CO as a PO | Column head `PO/CO No`; `is_consignment` not exposed on register rows | §3; MASTER §9.4 CO paragraph | API row `source_kind`; column head `PO No` per instruction with a `CO` marker on consignment rows; GRN paper unchanged | API test on an `is_consignment` PO; page test prints the CO marker |
| R5 | GRN Date from schema semantics, never from the number | No such column; `receivingRecordNo` derives a display number from dates for pre-0426 rows | MASTER §7.3/§9.4: the GRN exists FROM the posted session → `posted_at` (MYT date) is the GRN Date; `goods_received_at` stays the physical-arrival fact (optional column) | API `grn_date`; page column | API test: `grn_date` = MYT date of `posted_at`, never parsed from `grn_no` |
| R6 | Toolbar: Start Receiving left; Search/Export/Columns right; Hide/Show filters; no Clear filters anywhere; re-click clears a rail section; search clears in Search; column conditions clear in their menus | Rail carries `Clear filters`; DataGrid's condition strip carries a global `Clear filters`; no Hide/Show filters on this page | §4 overrides the 2026-09-06 `Clear filters` row; UI MASTER LOCAL FILTER RAIL COLLAPSE | `OperationReceiving.tsx`; `DataGrid.tsx` optional `hideClearFilters` | Page test: no element with text `Clear filters`; Hide/Show round-trip preserves selections |
| R7 | Rail closed by default at 768–1129px, 240px when open; toolbar controls reachable while the table scrolls sideways | Rail always open; no width-dependent default | §4; UI MASTER rail 240px | `OperationReceiving.tsx` (`matchMedia` seed when no stored choice) | Page test with a mocked `matchMedia`; 831px walk screenshot |
| R8 | Footer information-only; pagination in the top control area only when >1 page; counts over the complete dataset; facet groups hidden when they cannot narrow | Footer holds Previous/Next; facet groups always render | §4; UI MASTER REGISTER STATUS FOOTER | `OperationReceiving.tsx` | Page test: no buttons in `grid-footer`; pager appears only when `total > limit` |
| R9 | Context preserved when returning from a GRN (search, conditions, sort, page, scroll) | Register stays mounted (`invisible`) — preserved today | Manual Purchase / SO object law | unchanged; regression test kept | Page test: open row → back → search + page intact |
| R10 | Two-month expected-arrival calendar, display-only, counts not colour, today thin outline, arrows move one month keeping two months, no work cards, never invented dates | One month; it FILTERS the register; today is blue text, not an outline; fixed above the filters | §5 (display-only per the original blueprint) overrides the 2026-09-06 filter behaviour; UI MASTER MonthCalendar law (counts, aria) | `components/kit/MonthCalendar.tsx` (`months`, `selectable=false`, `today` ring); `OperationReceiving.tsx` | Kit test: two captions, arrows advance one month; page test: picking a day narrows nothing |
| R11 | 13 Sep review refinements (count units, per-month empty message, overdue handling, scrollable rail) shown and labelled PENDING OWNER ACCEPTANCE; filters never made inaccessible | n/a | §5 — review recommendations are not owner decisions | calendar block lives in the rail's scroll region; per-month empty sentence; overdue aria/word | Screenshot + matrix row marked pending |
| R12 | Six evidence flows (Damaged/Wrong Item/Extra × Photos/Videos), scoped by GRN + stable line identity + type + kind; real files, verified counts; enlarge/navigate; video playback; five states; zero qty → no action | Damaged/wrong photos only (paths in `lines` jsonb, no videos); extra lines have no evidence and no stable identity; nothing viewable from the Register | §6; ERP Law A one owner (new table owns exception evidence); Law D (one count predicate) | Migration `0493` (`receiving_line_evidence`, extra ids, validator, projection, RLS); `storage/dos.ts` claim kind gains video; API `GET /:id/evidence`; `ExceptionEvidenceViewer.tsx` on kit `Modal width="viewer"` | PGlite SQL tests; API tests; web viewer tests for all five states; browser walk of upload → save → reopen → view/play in a non-production store |
| R13 | GRN detail: 50/50, sections `This receipt · Current PO balance · Related receipts · Exception follow-up · Inventory Result · Evidence and audit history`; PO-2054 facts verified; exact claim link; no invented states | Detail mixes this receipt's totals with the PO's cumulative under one `Receiving Summary`; `What this saving did` prose; `Open in Claims` goes to the Claims homepage | §7; MASTER §9.4 GRN object 50/50 | `ReceivingRecord.tsx`; API detail gains `claims`, `related_receipts`, `inventory` facts | Page tests on a PO-2054-shaped fixture: `Received 1 · Damaged 1`, `Received 2`, `Ordered 3 · Received 3 · Outstanding 0`, claim `SC-1014 · Closed` link |
| R14 | Previously reviewed DB defects (STABLE RPC with temp tables; backfill bumping `updated_at`; JSON array rebuilds; search missing names; Extra positive-qty validation; path validation; SQL never executed) | None of that code exists on `main` (no register RPC; register scans in the Worker). The RISKS are real for the new store | §8 | Migration `0493` designed append-only (INSERT rows, never array rebuild); backfill is INSERT…SELECT; validator checks `qty > 0`, path shape, extension, and existence in `storage.objects` | PGlite tests: two appends persist independently; historical rows without extras project nothing; extra ids stable across amend; bad path refused |
| R15 | Whole-workflow verification incl. duty gates, duplicates, cancellation blockers, keyboard, narrow layout; SMOKE rows investigated, never deleted | Existing suites cover much of it | §9 | Existing suites + new ones; browser walk on the dev preview entry | Delivery matrix below names each check and its result, `NOT VERIFIED` where it could not run |

**Verification environment (measured):** no local PostgreSQL, Docker or Supabase CLI on this
machine. The API workspace already runs real PostgreSQL in-process through `@electric-sql/pglite`
for migration SQL tests (`apps/api/src/test/ready-stock-reservation-database.ts`); this card uses
the same harness. Interleaved multi-connection concurrency cannot run on PGlite and is reported
as such. Storage round-trips run against a non-production bucket path only where such a store is
reachable; otherwise the row is `NOT VERIFIED`.

## Build incident — 2026-09-13

The first build of this card lived in a session-scoped scratchpad worktree that was wiped when
the Claude Code session restarted, before any commit had been made. Every file was rebuilt from
the session's own record onto the durable in-repo worktree `.worktrees/receiving-grn-redesign`
and committed immediately. The screenshots captured on the first build were lost with it and
were re-captured from the rebuilt preview (see below). Lesson recorded in memory: commit a WIP
before any long-running gate, never keep a build only in a scratchpad.

## Requirement matrix — AT DELIVERY (2026-09-13, branch `build/receiving-grn-redesign`)

Legend: **VERIFIED** = an executed check with its evidence named · **NOT VERIFIED** = the check
could not run here, with the reason · **PENDING OWNER ACCEPTANCE** = a design refinement shown in
the build that is not an owner decision.

| # | Requirement | Fix | Actual verification | Remaining blocker |
|---|---|---|---|---|
| R1 | Default columns, exact order | `OperationReceiving.tsx` columns rewritten; secondary facts `defaultHidden` under Columns groups; `storageKey` bumped to `.v3` | VERIFIED — page test `prints the DEFAULT columns exactly…`; Playwright read the rendered heads `GRN No · GRN Date · Supplier DO No · Supplier · PO No · Items · Received Qty · Exceptions · GRN Status`; screenshot `01-register-1440.png` | At 1440 the default sheet is wider than the column because the `Exceptions` cell carries the summary and six doors on one 38px line (owner rule); the sheet scrolls with the identity pinned. NOT VERIFIED inside the real portal shell (the preview draws no sidebar). |
| R2 | Expansion `Item · Received · Damaged · Wrong Item · Extra`, full name, no SKU, only this GRN's lines | `GoodsMiniTable` `receivingLayout`; `grnLineName` ladder (snapshot → catalog-with-model → SKU, source printed); PO-line configuration words (`poLineConfigBits`); validator snapshots `item_label` at posting (0493) | VERIFIED — child-table tests; page test `▸ expands to THIS receipt's own lines…`; PGlite `snapshots the goods' full name at posting`; API test `line_labels` (fixture without a model resolves to the SKU, labelled); screenshot `02-expanded-exceptions-1440.png` | Every GRN posted before 0493 has no snapshot and prints the CURRENT catalog name with `name from the current catalog` — the historical name of those receipts is unknowable and is said so. |
| R3 | `Confirmed` / `Cancelled` | `WAREHOUSE_RECEIPT_STATUS_LABEL.posted = "Confirmed"`; COPY-STANDARD row replaced; MASTER §9.4 | VERIFIED — shared, page and template tests; source scan finds no `Valid` on Receiving surfaces | — |
| R4 | CO identified, never relabelled | `source_kind` on the row; `CO` marker in the cell and export; object header `· CO` | VERIFIED — API test (`source_kind`), page test `identifies a consignment source as a CO` | — |
| R5 | GRN Date from schema semantics | `grnDateOf(posted_at)` in MYT (`purchasing/MASTER.md` §7.3: the GRN exists FROM the posted session); `Goods received on` stays optional | VERIFIED — shared test (`17:30Z on 4 Sep` → `2026-09-05`), API detail test (`2026-09-06`), page test (`Sun, 30 Aug` on a GRN whose number says 30 Aug because the fixture posted then) | PO-2054's two receipts posted on 5 Aug 2026 print GRN Date 5 Aug = Goods received on (same day) — measured on production rows, not invented. |
| R6 | Toolbar layout; no Clear filters; re-click clears; Hide/Show filters | `Start Receiving` + `Show filters` left, engine Search/Export/Columns right; rail `Clear filters` deleted; `DataGrid.hideClearFilters`; `FilterRail onHide` | VERIFIED — page tests (no `Clear filters` text anywhere, Hide/Show round-trip keeps the pick), DataGrid test; Playwright `clearFilters:false` at 831 and 1440 | — |
| R7 | 768–1129 rail closed by default, 240 when open; toolbar reachable while the sheet scrolls | `initialRailOpen()` (stored choice, else `matchMedia`); `min-w-0` on the register column; **second pass:** the shell's content frame is now `flex flex-col overflow-hidden` for `tab === "receiving"` (`OperationApp.tsx`) — measured inside the REAL Portal shell the page ran 50px past the frame as a block child and the 32px footer sat below the fold | VERIFIED — page test with mocked `matchMedia`; Playwright INSIDE THE PORTAL SHELL (`portal-shell-preview.html`: real `OperationApp` + `PortalSidebar` + `PurchasingTabs`, MemoryRouter at `/operation?tab=receiving`) at 1440 and 831: sidebar 232/60 · rail 240 or absent · toolbar 45 · header 36 · row 38 · footer 32 at y 860 · sheet scrolled 422/600px with Start Receiving, Search, Columns and the GRN No identity still in view · no `Clear filters` · no horizontal body scroll — `docs/evidence/receiving-02-grn-register/shell-*.png` | Real routing is exercised under a MemoryRouter (the dev entry cannot own `/operation` in `vite dev`); the sidebar, tab handling and destination header are the production components. |
| R8 | Footer info-only; pager top only when >1 page; complete-dataset counts; hidden facet groups | Pager moved to `toolbarEnd` behind `total > limit`; footer `{n} GRNs · showing… · {n} of {all} match`; API `page.total_all`; `canNarrow()` hides a facet group whose one value every row shares | VERIFIED — page tests (`the status footer is information only…`, `paginates on the SERVER — the pager sits in the top control area…`, `a changed filter returns the register to page 1, and the footer says narrowed-versus-total`); Playwright footer `32px`, text `3 GRNs`; the walk showed `GOODS ARRIVED AT` hidden because every GRN arrived at one site | — |
| R9 | Context preserved on return | Register stays mounted (`invisible`) — unchanged | VERIFIED — existing page test still green; **second pass:** inside the Portal shell the expansion was still open after Back from the record at both widths (`shell-walk` `expansionKept: true`) | — |
| R10 | Two-month display calendar | kit `MonthCalendar` `months` / `selectable=false` / thin-outline today; page passes `expectedArrivalCounts` markers | VERIFIED — kit tests (two captions, one-month arrows keeping two, display-only click, today ring); page tests; screenshot `01-register-1440.png` (SEPTEMBER + OCTOBER, `1`/`2`/`1` counts, 13 outlined) | — |
| R11 | 13 Sep review refinements shown, labelled pending | `overdue` word + red count · per-month `No supplier arrivals expected in {Month}` · count unit `expected supplier arrival(s)` · display scrolls with the filters | VERIFIED as SHOWN — kit + page tests; Playwright `railScroll:true` (filters reachable under two months) | **PENDING OWNER ACCEPTANCE** — recorded in `purchasing/MASTER.md` §9.4 and `carry-forwards.md`. |
| R12 | Six evidence flows, scoped viewers, five states, real files | Migration 0493 (`receiving_line_evidence`, media path law, extra ids, videos in the validator, projection trigger + INSERT…SELECT backfill, `receiving_line_evidence_add`); `storage/dos.ts` claim kind takes video; API `GET /:id/evidence` with per-file `ok/missing/unsigned`; `ExceptionEvidence.tsx` doors + viewer; Session gains damaged/wrong video pickers and extra-line photo/video pickers; Amend gains append-only pickers | VERIFIED — PGlite 15 cases (paths refused by name: foreign prefix, wrong kind, traversal, missing object; videos accepted; zero exception drops evidence; extra ids stable; projection idempotent and never touching `updated_at`; append door: rows inserted, duplicate no-op, two actors both persist, refusals by name incl. duty gate; RLS + grants); API tests (evidence route scoping/signing/states, `verified:false` when 0493 absent, amend routing, office/warehouse key mapping, claim video signing); web viewer tests (all five states, missing/unsigned files named, enlarge + ‹ › + arrow keys, real `<video controls>`); screenshots `03-…`, `04-…`, `05-…` on fixture files | **NOT VERIFIED — Storage round-trips (upload → save → close → reopen → view/play on real Storage):** the only Supabase project is production (`ENGINEERING.md`: *staging IS production*; `list_branches` shows the default branch only; creating a preview branch provisions a paid resource and was not authorised; no local Supabase CLI/Docker). The runnable test exists — `apps/api/src/test/receiving-evidence-storage.integration.test.ts` (six round-trips through the real bucket, the real door, the real route with a JWKS-verified JWT, byte-equal signed download, `missing` after deletion, 403 for a warehouse account, refusals by name) — and SKIPS until `CARRES_NONPROD_SUPABASE_URL` + keys + an operation login + a posted receiving id on a NON-production project are supplied. **VERIFIED on a real multi-connection PostgreSQL (full chain):** two operators appending to the same GRN inside open transactions — the door serialises on the receiving row and BOTH appends persist; the same file from two connections is one row and the loser is told `added: 0`; kind mismatch, missing object and zero-exception refusals by name (`receiving-postgres.integration.test.ts`). |
| R13 | GRN detail sections; PO-2054 facts; exact claim link; factual Inventory Result; real renderer | `ReceivingRecord.tsx` rewritten into six sections; API detail gains `claims`, `related_receipts`, `line_evidence`, `line_config`, `grn_date`, Unit `current_status`; `What this saving did` retired; Print/Download unchanged (saved record through the real renderer) | VERIFIED — page test `the PO-2054 example…` on production's own row id (`GRN-050826-0883` · Received 1 · Damaged 1 · sibling `GRN-050826-3948` Received 2 · Ordered 3 · Received (all receipts) 3 · Outstanding 0 · `SC-1014 · Closed` linked to `/operation?tab=claims&claim=…` · `Unit outcomes were not recorded`); production rows read for those facts (`warehouse_receipts`, `purchase_order_lines`, `supplier_claims`); screenshots `06-…`, `07-…`, `08-…` show the six sections; the A4 preview was seen drawn in the interactive walk (the headless capture fires before pdf.js finishes) | The production PO-2054 damaged-photo path `receiving/p5/damaged-1.jpg` is not in `storage.objects` (measured) — the viewer will name it `Recorded file is not in storage`, which is the truth, not a defect of this build. |
| R14 | Previously reviewed DB defects | None of the reviewed code exists on `main` (no register RPC, no 0480 backfill); the risks were designed out of 0493: INSERT rows not array rebuilds; INSERT…SELECT backfill (no `updated_at`); positive-qty and path validation; search carries snapshot + catalog names + SKU | VERIFIED — PGlite cases named above; API test asserts `searchText` behaviour through `buildGrnRegisterView` fixtures; **second pass:** `0493` applied cleanly in the FULL-CHAIN replay (`scripts/dry-run-migrations.mjs`, PostgreSQL 18.4, 496 files: 491 applied, the 5 failures are all on the known list and predate this card) | `receiving_amend`'s existing `arrival_evidence || …` array append (0427) is UNCHANGED — arrival evidence was not in this instruction's scope; noted, not hidden. |
| R15 | Whole-workflow verification | Existing Session/review/amend/void/duty suites kept green and extended | VERIFIED where a suite exists: Start Receiving lookup + owing filter · duty refusal sentence · Save names the first missing fact · per-Unit outcomes · extra lines with ids · check-in/return · amend/void doors · Warehouse 403 on amend/void · keyboard: Escape closes the viewer, arrow keys step photos, kit dialog returns focus · 831px and 1440px walks | **VERIFIED (second pass, real PostgreSQL, full chain, several connections — `receiving-postgres.integration.test.ts`, 7 cases):** a receiving posted end to end through `office_receive_post` mints a GRN, books the exact Unit and leaves the un-received one `incoming` · the same Unit scanned twice in one count → `unit_scanned_twice` · the same Unit on a later receiving → `unit_already_received` · a Unit of another PO → `unit_not_on_this_po` · **two operators posting the same Unit at the same moment: the second waits on the PO row lock and is refused after the first commits; one GRN exists** · a damaged Unit opens a supplier claim and the void is refused `claims_block_void` · a received Unit that moved on → `units_block_void` · a clean receiving voids, the Units return to `incoming` and the PO line's received quantity is given back · an empty reason → `void_reason_required` · the duty gate: nobody assigned → `no_grn_duty_holder`, a holder assigned → `not_grn_duty` for others, the holder posts with the trio stamped · RLS: an operation client reads the evidence, cannot insert (42501), a warehouse account sees none. **NOT VERIFIED:** export of the full result set (engine behaviour, unchanged) · SMOKE rows: four `PO-SMOKE-*` GRNs exist on production (one voided); they are listed by the Register like any GRN and counted in `total_all`; nothing was deleted and nothing new was created. |

### Executed gates (2026-09-13, after rebasing onto `origin/main` `650abf39`)

| Gate | Result |
|---|---|
| `tsc --noEmit` web (`tsconfig.app.json`) · api · shared | 0 errors each |
| `pnpm lint` (web) | exit 0 |
| `node scripts/check-migrations.mjs` | 496 filenames validated, 1 new migration (`0493`), nothing applied |
| api full `vitest run` (incl. PGlite `receiving-line-evidence.test.ts`, 15 cases) | 153 files · 3206 tests · 0 failed |
| web full `vitest run` | 330 files · 4589 tests · 0 failed |
| shared `vitest run` | 152 files · 3283 tests · 0 failed |
| Playwright walk of the dev preview at 1440×900 and 831×900 | header row 36 · body row 38 · footer 32 · rail 240 when open, absent when closed · `Clear filters` text absent · Search and Columns inside the viewport at 831 · two month grids · `Show filters` present at 831 · register still mounted behind the record |
| **Second pass** · Playwright walk INSIDE the Portal shell (`portal-shell-preview.html`) at 1440×900 and 831×900 | sidebar 232 / 60 · module header 50 · toolbar 45 · header 36 · row 38 · footer 32 at the frame's foot · rail 240 / absent · sheet scrolled sideways with the toolbar and identity column in view · GRN detail six sections · GRN paper canvas rendered · expansion kept after Back — 12 screenshots in `docs/evidence/receiving-02-grn-register/` |
| **Second pass** · full migration-chain replay on real PostgreSQL 18.4 (`scripts/dry-run-migrations.mjs`, binaries from the `embedded-postgres` npm package + Homebrew `libpq`) | 496 files · 491 applied · 5 failed, all on `migration-replay-baseline.json` · `0493` applied · finding for `main`: `0463`/`0466` now replay cleanly and should leave the baseline (not changed here — unrelated to this card) |
| **Second pass** · `receiving-postgres.integration.test.ts` on that database (`CARRES_TEST_DATABASE_URL`) | 7 cases · 7 passed · re-run clean with a fresh run tag · 7 SKIPPED (never passed) without the URL |
| **Second pass** · `receiving-evidence-storage.integration.test.ts` | 9 cases · 9 SKIPPED — no non-production Supabase project exists; prerequisite named in the file |

Two stale expectations and one unpublished palette step were found by the full gates and fixed in this
commit: `warehouse/receiving.test.ts` (the RPC now carries `damaged_videos`/`wrong_item_videos` and extra
`id`/`photos`/`videos`), `OperationReceivingReport.test.tsx` (its money regex matched the `rm` inside
`Confirmed`; now `\bRM\b`), `ReceivingWorkspace.tsx` (`kit-amber-9` is not published; `kit-amber-11`).

### Screenshots — committed, every one from FIXTURE data
`docs/evidence/receiving-02-grn-register/` (its `README.md` names the entry, viewport and data
of each file): twelve `shell-*.png` from the REAL Portal shell entry and ten `preview-*.png` from
the standalone page entry. No screenshot shows a production or non-production record; the
real-record evidence for the Storage round-trips does not exist yet (R12).

## Second pass — 2026-09-13, after the first draft PR (#1274)

**Historical prototype comparison not performed** (owner ruling 2026-09-13, fourth pass: the unavailable `receiving-proposal.html` / handoff comparison is WAIVED as a prerequisite; the complete written requirements in the instruction are the acceptance baseline; no visual equivalence to the unseen file is claimed). The paragraph below records why the files were never compared.

**Blueprint comparison (step 1): the files never reached this machine.** The
first follow-up said `receiving-proposal.html` and `CLAUDE-HANDOFF.md` were attached; the second
said a ZIP containing them was attached. Neither message carried attachment content into the
session, and no such file exists on disk (session scratchpad, the desktop app's data folder,
Downloads, Desktop, temp, or anything under the home directory newer than 90 minutes; searched
twice). Nothing was substituted. Until they arrive, the comparison below is against the AGREED
WRITTEN REQUIREMENTS of the 2026-09-13 instruction (§§2–9), which the handoff's precedence rules
already rank above the prototype's historical audit text. Rows that depend on the two files are
marked NOT RECEIVED.

### Comparison against the agreed written requirements — 2026-09-13, head of PR #1274

| Requirement (instruction) | Implemented behaviour | Discrepancy | Correction | Verification |
|---|---|---|---|---|
| §2 Kit and geometry: 50 / 45 / 36 / 38 / 32 / 240; one destination, one Register, no monitor/tabs/KPI cards | Measured inside the real Portal shell: module header 50 · toolbar 45 · header 36 · row 38 · footer 32 · rail 240; page test `is ONE destination — no Calendar/Register view switch, no Receiving Monitor` | The page overflowed the shell frame by 50px (found only by the in-shell walk) | `OperationApp.tsx`: the receiving tab gets the bounded flex frame | shell walk at 1440 and 831, `docs/evidence/receiving-02-grn-register/` |
| §3 Default columns exactly `Expand · GRN No · GRN Date · Supplier DO No · Supplier · PO No · Items · Received Qty · Exceptions · GRN Status` | Exactly that order; secondary facts optional under Columns | none | — | page test `prints the DEFAULT columns exactly…`; shell walk `heads` |
| §3 Expansion `Item · Received · Damaged · Wrong Item · Extra`; full real names; no SKU column; only the GRN's own lines; Received excludes damaged/wrong/extra | Child table with those five heads; `grnLineName` snapshot → catalog → SKU (source said); Received is the line's own received count | none | — | page test `▸ expands to THIS receipt's own lines…`; shared `grn-register-facts.test.ts` |
| §3 GRN Status `Confirmed` / `Cancelled` over existing internal states | `posted → Confirmed`, `voided → Cancelled`; no new state | none | — | shared test `maps the EXISTING internal states…`; page test `speaks document status words…` |
| §3 CO identified, never relabelled | `source_kind` + `CO` marker on the row and object header | none | — | page test `identifies a consignment source as a CO…` |
| §3 GRN Date from schema semantics | `grnDateOf(posted_at)` in MYT | none | — | shared test `is the posting's stamp read in MYT, never the number` |
| §4 Start Receiving left; Search/Export/Columns right; NO Clear filters; re-click clears; Hide/Show filters | As specified; `Clear filters` absent on every surface | none | — | page tests `draws the 240px rail… no Clear filters anywhere`, `a category pick narrows… picking it again clears…`, `Hide filters removes the rail…`; shell walk `clearFilters:false` |
| §4 Rail closed by default 768–1129, 240 open; toolbar reachable while the sheet scrolls | Closed at 831 unless remembered; toolbar controls in view with the sheet scrolled 600px | none | — | page test `between 768 and 1129px…`; shell walk 831 |
| §4 Footer info-only; pager top only past one page; complete-dataset counts; facets that cannot narrow hidden | As specified | none | — | page tests `the status footer is information only…`, `paginates on the SERVER…`, `shows real counts from the COMPLETE GRN result set` |
| §4 Context preserved on return | Register stays mounted; expansion kept after Back in the shell | none | — | page test `a row opens the record, and the register stays MOUNTED…`; shell walk `expansionKept:true` |
| §5 Two-month display calendar from kit primitives; display-only; counts not colour; today thin outline; arrows one month keeping two; no work cards; no invented dates | Kit `MonthCalendar months={2} selectable={false}`; markers from evidenced supplier replies only | none | — | kit tests (5); page tests `shows TWO complete months…`, `the month arrows move exactly one month…`, `marks expected supplier arrivals with an accessible COUNT…`, `the calendar is a DISPLAY…` |
| §5 13 Sep review refinements shown as PENDING owner acceptance; "two months" never claimed as a universal standard | Shown and labelled pending in MASTER §9.4 and carry-forwards; no such claim anywhere | none | — | card R11; `docs/carry-forwards.md` |
| §6 Six evidence flows scoped by GRN + stable line identity + type + kind; five states; zero qty → no door | Six doors → one viewer; `GET /:id/evidence` scoped; five states; zero exception draws nothing | none in behaviour | — | viewer tests (10); page tests `the Exceptions doors open ONE viewer…`, `a row whose evidence counts are not verified says so…` |
| §6 Verify upload → save → close → reopen → view/play on non-production Storage + DB | Runnable test exists; cannot run here | **environment blocker, not a design discrepancy** | none possible here | NOT VERIFIED — see the Storage prerequisite below |
| §7 GRN detail 50/50 with the six named sections; PO-2054 facts; exact Claim link; `What this saving did` replaced | As specified; the phrase is absent from the surfaces | none | — | page tests `the PO-2054 example…`, `a Valid GRN is 50/50…`; grep of the surfaces |
| §8 Reviewed DB defects closed and proven | Designed out of 0493; PGlite 15 cases; full-chain replay; real multi-connection PostgreSQL 7 cases | none | — | see the corrected migration report below |
| §9 Whole workflow; SMOKE rows investigated, never deleted | Suites + shell walk + real-Postgres doors; four `PO-SMOKE-*` GRNs counted, none touched | none | — | card R15 |
| Prototype `receiving-proposal.html` / handoff precedence rules | — | **historical prototype comparison not performed** (waived by the owner as a prerequisite) | — | — |

**Agreed design discrepancies still requiring fixes: none found against the written requirements.**
The one defect the second pass found (the shell frame) is fixed at the head of this PR.

**Optional refinements — NOT completion requirements, listed separately:**
- The 13 Sep review items (overdue word/ink, per-month empty sentence, count unit, scrolling rail) —
  shown, pending acceptance; the existing kit behaviour is retained.
- At 831 with the rail open the child table scrolls sideways with the sheet — the existing kit
  behaviour, retained; a pinned child table is NOT introduced.

### Migration replay — corrected report

"491 of 496 applied" is not a clean replay. The five failures, from
`docs/audits/2026-09-10-MIGRATION-REPLAY.md` and this run's `replay.json`:

| File | Why it fails from scratch | Objects it defines | Touches this feature or its tests? |
|---|---|---|---|
| `0149_rename_ohana_hookka` | asserts a production supplier row (red line 8) | none | no |
| `0317_the_record_stops_claiming_a_send` | a backtick inside its closing `do $$` comment breaks the parse | `purchasing_record_send` | no (PO send record) |
| `0339_one_purchase_order_creation_authority` | revokes a function signature that never existed (drift) | none | no |
| `0398a_the_five_purposes_a_purchase_may_serve` | collision-order check constraint | `purchasing_set_purpose_approval`, `purchasing_create_request`, `purchasing_create_demand`, `purchasing_issue_pos_batch` | no |
| `0453_a_quantity_row_is_keyed_not_identified` | its own sanity query runs `pg_get_functiondef` over an aggregate's oid (42809) | `gen_quantity_key` (new), `receiving_amend`, `ops_stock_book_in_units`, `operation_receive_po_with_do` (re-created), `gen_unit_code` (DROPPED), two views | **YES** — `receiving_amend` and `ops_stock_book_in_units` are receiving doors; on the plain replay they carried their PRE-0453 text and quantity rows still minted `id-…` keys |

What that meant for the first integration run: `office_receive_post`, `warehouse_receipt_validate_lines`
(0493), `receiving_void`, `receiving_line_evidence_add` and the duty gate — every door the seven
cases assert on — are defined by files that replayed; only the quantity-line stock consequence
inside the posting ran the pre-0453 book-in. **Closed:** 0453 was then applied to the throwaway
cluster from a scratch copy (its sanity query rewritten as a materialised CTE, its two views
skipped because 0471 already carries their later shape — never committed, never a migration
edit), the generator swap verified (`gen_unit_code` gone, `gen_quantity_key` present, no
`unit_code` DEFAULT), and the seven cases re-run: all pass, and the quantity row minted on that
run wears a `QTY-` key. `0463`/`0466` replayed cleanly and should leave the baseline on `main`
(not changed here).

**Stubbed Supabase versus actual integration — what the replay proves and what it does not.**
`scripts/dry-run-supabase-stub.sql` provides the roles, `auth.users`, `auth.uid()/role()/jwt()`
reading the request-claims GUC (as PostgREST sets it), `storage.buckets` and `storage.objects`
as plain tables, and the extensions. So the integration cases are REAL for: the committed
PL/pgSQL doors, row locks and transaction interleaving across connections, RLS policies under
`set role authenticated`, and the media law's existence check against `storage.objects`. They are
NOT real for: GoTrue sign-in and JWT issue/verification, the Storage API (upload, signed URLs,
object bytes), PostgREST's RPC transport, and the Worker route in front of the door. Those are
exactly what `receiving-evidence-storage.integration.test.ts` covers and what stays NOT VERIFIED.

### Storage round-trips — the secure non-production prerequisite

Runnable test: `apps/api/src/test/receiving-evidence-storage.integration.test.ts` (six flows,
real bucket → real door → real route with a JWKS-verified JWT → byte-equal signed download; the
`missing` state after deletion; 403 for a warehouse account; refusals by name). It refuses the
production project ref and SKIPS when unset. To run it, an owner-authorised person provisions a
NON-production project (a Supabase preview branch of the project, or a separate project) with the
chain applied, one operation login holding GRN duty, one posted receiving carrying a damaged
unit, a wrong-item unit and an extra line, and optionally one warehouse login. The values go into
a GitHub Actions environment secret set or a local untracked `.env` file — never into a chat,
never into the repository. Nothing here was run against production.

**Non-production infrastructure inspected before declaring anything blocked:** Supabase — one
project (`kfprgpjpaffedghytstl`, production), `list_branches` returns only the default branch; a
preview branch is a paid provision and was not authorised. CI — `ci.yml` runs migrations law, lint,
typecheck, tests and build with NO database service and NO preview deployment; `deploy-production`
runs on `main` only. Cloudflare — `wrangler` is not logged in here and a Pages preview of this
branch would point the built bundle at the production API/Worker, which does not carry this card's
routes. Local — no PostgreSQL, Docker or Supabase CLI; solved for the DATABASE half by fetching
PostgreSQL 18 binaries through the `embedded-postgres` npm package into the session scratchpad and
`psql` through Homebrew `libpq`, then running the repository's own replay harness. Storage has no
local equivalent, so the Storage round-trips stay NOT VERIFIED with their runnable test in place.

**Found and fixed by the shell walk:** the Receiving page inside the real Portal shell overflowed
its frame by the 50px module header (footer below the fold at both widths) — the shell's content
wrapper was a block for this tab. Fixed in `OperationApp.tsx` (the tab now gets the flex frame the
Sales Orders and Delivery Orders registers already have).

**Remaining owner-review refinements (unchanged, still pending acceptance):** the 13 Sep review
items in R11; plus one observation from the shell walk — at 831 with the rail open the expansion's
child table scrolls sideways WITH the sheet (the standalone preview showed the same); whether the
child table should stay pinned under the identity column is a presentation question for the owner.
