# HANDOFF — Carres Portal v2 · continuous build

Paste everything below the line into a fresh session. It is self-contained.

> **`docs/handoff/` HOLDS EXACTLY ONE LIVE PROMPT, AND THIS IS IT.** When this lane's mission
> changes, OVERWRITE this file — never add a second one beside it. Git history keeps the earlier
> checkpoints (`git log -p -- docs/handoff/CARRES-CONTINUOUS-BUILD-HANDOFF.md`). Re-measure every
> SHA and status below before trusting it.

---

CARRES PORTAL v2 — CONTINUOUS BUILD · checkpoint 2026-10-16 (UI kit lane)

**Current publication and delivery:** the ONE physical `docs/ui/MASTER.md` is on main through merged PR #2087, `58047ed1f9624f0a796e6560e3deed1d1c2f1255`; its required CI passed. Root CLAUDE/AGENTS name it, and former01/02/03 paths only redirect. Desktop's bounded startup pointers now read `origin/main` while all existing dirty work is preserved. Earlier “unpublished” baseline paragraphs below are historical. Existing-page fixes continue in the same PR #2086, not a new kit. Current bounded verification: corrected page tracking assertion4/4; shared focus/fields/catalogue/SO reader tests77/77. SO Why uses the existing dialog-container provider: personally opened calendar inside Why, Esc returned to Why, Cancel retained saved facts; no business write. Broader historical findings retain their original scope and are not an all-Portal PASS. The former433px toolbar blocker is fixed in8e2c746a2: existing common shell temporarily uses compact navigation below1100 with Tasks open, preserves stored preference, and guards expansion before hiding Tasks; Workspace is excluded.127 sidebar tests and the original4 targeted1025 browser cases PASS. Developer personally measured nav64/canvas589/cut[]/page1025, expansion/reopen cycle and1164 restoration. This supersedes older pending-toolbar wording below; production proof is not yet claimed.

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

**Documentation reconciliation · 16 Oct 2026:** the following 15 Oct implementation and test observations are reports retained from `codex/kit-preview-index` (including `2c457b03b`, `14d0274e6`, `8a911c1d1`, `6d1f78c24`) and the existing #2085 record. This document-only publication did not repeat those tests or establish the current production SHA. Approved rules remain in the owning MASTERs; local checks and proposals are not deployment or owner acceptance. PR #2087 merged the consolidated UI MASTER and portable chat entry as `58047ed1f`; earlier “unpublished” notes below describe their dated local state only.

Production snapshot reported on 15 Oct: `7f4f7dd34` (ERP, POS and API manifests read 15 Oct 2026 after deploy run
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
with the next functional release, not on its own. Reviewed and integrated into
`codex/so-batch-toolbar-fit` as `fc3ae1251`; not deployed.

**Current local functional lane (15 Oct):** Audit cleanup `05b1ae058`/`e05ef20cc` and
canonical-doc reconciliation `a39ad6a80` are integrated. SO Batch now reuses `CViewButton`/
`CIconButton`; superseded local wrapping CSS and `wrapToolbar` are removed. Shared reference
toolbar icons use 32px, with approved 4px narrow gaps. Web typecheck/lint PASS; 243 targeted
SO Batch/Finance tests PASS; 14 browser checks at 1164/1440 PASS, including Tasks-open1164
and selection-bar stock actions. This is local scope, not deployed proof. The new focused1025
full-menu+Tasks geometry regression still fails:433px cannot hold the full named controls.
Existing user-click menu collapse gives589px and fits; automatic compact navigation is only a
controller-reviewed proposal pending Jess. Do not claim1025 complete, hide actions or adopt
two rows silently. Local screenshots stay untracked; no customer screenshots enter Git.

| Area | Deployed (PR · SHA) | Runtime-verified | Unfinished |
|---|---|---|---|
| Batch B release | #2083 `7f4f7dd34`; exact-head CI and deploy succeeded | Six requested production pages × 1025 / 1164 / 1440: 18/18 carres-check PASS | Owner acceptance; other module journeys and denied Finance-only lists are not covered by this measurement pass |
| One listing engine | v12 look #2071 `a6c6eabc9` · one ⋮ Page tools #2074 `241209c68` · whole table lines #2077 `ddd0edf0d` · Outright on the engine, CTable deleted #2079 `2a28f84d9` · engine group rows/chips 12/500 #2080 `cfa0ae0dc` | Production 15 Oct: table lines whole on Outright (last row too, no rounded rows), SO Batch last row, Forecast band; every list header 40 | Opened-row frame on lists other than Outright (owner, UI MASTER §7.2); Finance-only lists not readable with the available login; permitted Payment Records measured on #2083 |
| Shared parts | one menu #2070 · one pop-up #2072 · one pill drawing #2073 · one segmented control #2078 `4903bead6` · pill weight 500 only and Inbound site switch #2080 `cfa0ae0dc` | /ui computed equal; menus and pop-ups by keyboard in production | Summary panel only on Outright; Batch B deployed procurement/PO object segmented tabs and initials 11/700, full object-tab interaction walk still owed |
| Type to 01 §2 (by role) | Delivery, Warehouse, Stock + rail, caps labels, pills, side menu group word #2078 `4903bead6` · SO detail, Order Route, Delivery brief, reorder card, Purchasing, Receiving #2080 `cfa0ae0dc` | Production carres-check at 1025 · 1164 · 1440 on `4903bead6`: Delivery Orders, Delivery Monitor, Outbound, Inventory, SO Batch, Outright PASS; Inbound 2 findings (fixed in #2080). On `cfa0ae0dc`: Purchase Orders and Receiving PASS at 1025 · 1164 · 1440; Inbound PASS at 1440 and its Site switch ran off at 1025/1164 (wraps in #2081); Manual Purchase only the screen-reader `+` (#2081); SO page leftovers are field rows 33 vs 36, item rows 37 vs 44, model · spec on one line, its own items table (01 §5 order-line table owed) and initials 10/700 (#2081) | Batch B deployed remaining Operation, Finance, Principal, Supplier and HR type sites; six-page runtime measurement is in the Batch B row, other portal journeys still owed. Legacy old-orders is excluded; `sales-order-route.ts` text budget assumes 11px |
| Sales Order (Outright) | page 1 #2066 · Monthly demand door #2075 · engine + approved capabilities #2079 `2a28f84d9` | Production 15 Oct on `2a28f84d9`: carres-check PASS at 1025 · 1164 · 1440, rows closed and open; header 40, rows 54, footer `31 orders · Qty: …`; Group by Payment Status (Unpaid 1 · Partially paid 26 · Paid in full 4); sort SO no. both ways; Stock view PO numbers are links; row menu View · Print · Cancel SO (not clicked); tick `Select SO-1371`; chevron `Show items`; opened-row frame 1px `#CBD0D6`, corners 8, items Item · Qty · Supplier; SO no. stays in view at the right end | Owner walk; short-toolbar decision; SO quick card has no entry point (§5) |
| SO Batch Purchase | v12 look via the engine · one ⋮ · PO No comma fix · header 40 | Production PASS at 1025 · 1164 · 1440 (15 Oct) | A confirmed: existing deadline rule retained; B preserves existing authority; C proposal review (§5); D rejected; E reported (§6) |
| Workspace | Round 3 + `+ Task` (#2044–#2055) | Production read-only 15 Oct: feed 206 items, UI 193 (13 future on-day deliveries), each destination opens the exact record, reload keeps the same ids and module counts | Signed-in owner walk |
| Tasks | One feed `/api/operation/work?include=workspace`; no page writes tasks locally | Local replayed database 15 Oct (fixture users, nothing in production): internal task add → same id on retry → in the open feed (real `projectInternalTaskWork`: id `workspace:{task}:internal_task`, destination `/operation?tab=work&task=…`) → mark done on the same record (events added, done) → gone from the open feed; the Work ledger refuses completion except by the owning module's fact and needs a contact with a contact kind | Module task completion end to end: owner authorised the one SO-1254 TEST write; current source UI has no no-date answer entry (§4.2), so no write or closure is claimed |

Engine decision (evidence 15 Oct 2026): `register/DataGrid` is the one listing engine; every list,
Sales Order Outright included since #2079, passes `appearance="reference"`. `carres/CTable`, the
unrouted `SalesOrdersRegister.tsx` and `DestinationHeader.tsx` are deleted (UI MASTER §7.7 lists
what moved, what an owner ruling replaced, and the kept `SalesOrderCompactView`).

### Master Kit acceptance matrix · personal audit 15 Oct 2026

This is the single detailed kit acceptance matrix within the existing handoff, not a new tracker.
`APPROVED VALUE` comes from the named authority; `MEASURED IMPLEMENTATION` is observed code/runtime,
never a new ruling. PASS applies only to the stated check. UNVERIFIED is incomplete, not approval.
Current audit checkout moved externally from `kit-production-proof/Carres-Portal-v2` to
`/Users/chaichiewlim/carres-worktrees/kit-docs`, initial audit HEAD `44c9bf13e` (subsequent local commits recorded in rows); local server restored at
`http://127.0.0.1:5415/ui`. The Desktop checkout remains untouched.

| Item | Authority/source | Approved value and trigger | Actual measured value | Deviation/operator impact | Concrete fix | Verification | Status |
|---|---|---|---|---|---|---|---|
| 1 Layout/shell | 01 §4; 03 §1; UI §0/§2.2 | APPROVED VALUE: menu 220/64, top bar 56, toolbar 36; Summary 264, Tasks 320; viewport triggers in 01 | MEASURED IMPLEMENTATION: SO fixture at 1025/1164/1440: nav 220, top bar 56, Tasks 320; ground rgb(246,247,249) | Fixed locally in 133eb0177: detail under 1100 temporarily 64; list preference preserved. Sticky/overlay checks still owed | Fix detail navigation auto-collapse in shared shell lane; preserve list preference and verify Back | Personal computed styles and bounding boxes at all three widths, then own 1025 browser remeasure nav64/page1025 after 133eb0177. Functional lane reports 126 sidebar tests PASS incl manual expand and return-list preference | FIXED LOCALLY; broader shell UNVERIFIED |
| 2 Colours/states | 01 §1; token CSS; actual components | APPROVED VALUE: ground #F6F7F9, surface white, ink #1F2937; selection/hover/focus/disabled/status per 01 | MEASURED IMPLEMENTATION: SO list header bg #F8F9FA, ink #8A9099 at 1025/1164/1440; visible Proceed date button also #8A9099 | Fixed locally in 133eb0177: header role uses --c-secondary (#6B7280); global muted untouched. Neutral pill now #E5E7EB; menu shadow now 0 8px24 rgba(17,24,39,.12), browser measured. Focus common controls now fixed2px#3965FA; Button2px outside, input0 offset; old profile focus ignored and chooser removed. Hover/disabled/error inventory still owed | Shared DataGrid/token owner to replace header legacy grey with 01 label grey; measure remaining states | Personal pre-fix computed styles; functional lane personally remeasured #6B7280 after 133eb0177. Remaining states owed | FIXED LOCALLY; other colours UNVERIFIED; f70efac09 measured title/menu/pill fixes; focus slice78tests PASS; tsc33341 exit0 before later class-only Button/sample corrections |
| 3 Typography | 01 §2/§5; CListCell/COrderLines | APPROVED VALUE: Inter and role-specific pairs, wrapping rules; identifier 13/600, header 12/500 | MEASURED IMPLEMENTATION: SO list header12/500, body13/400; Kit title20/600/28 with tracking −0.2px after fix; card titles15/500/22; menu group11/500/.66px, ink#6B7280 | Family/line-height/tracking/wrap may differ from approved role | Inspect loaded font and computed text styles across full pages | Personal computed styles for listed roles; TaskView draft-mount test among 32 targeted tests PASS; font-file loading and remaining roles still owed; f70efac09 web tsc exit0, 32 targeted component tests and lint exit0 (legacy warn-only guard findings remain) | UNVERIFIED |
| 4 Measurements | 01 §§3–7; DataGrid/ItemRows | APPROVED VALUE: header 40, parent row 54, item minimum 44; measurements include trigger | MEASURED IMPLEMENTATION: SO at 1025/1164/1440: Items header 40, all 7 body/total rows 44; document width equals viewport; `/ui` 1025 content 977 | Menu default172 was below approved250; fixed default250 with viewport cap. 0cfd0fe01 removes two old236 View-menu overrides; functional lane reports207 tests PASS and actual SO Batch/Forecast menu250. Explicit picker widths preserved. Menu padding6/radius8 measured. Expanded item/full inventory still owed | Measure bounding boxes, min/max, hit targets, rows, dialog and panel geometry | Personal DOM check at all three SO desktop widths; hit targets/dialogs still owed | PARTIAL PASS |
| 4a Shared Button variants/states | 01 §§1–3; kit/Button.tsx | APPROVED VALUE: main13/600; word height34 (toolbar32/panel30/small28); disabled45%; touch44 minimum | MEASURED IMPLEMENTATION at Kit desktop: primary13/500, md32, small24, disabledopacity0.4; icon button32. Input32, error field aria-invalid=true and amber#7A5A00 | Fixed locally: primary600, small28, disabled.45 browser measured; default md32 still needs consumer-context inventory before changing every toolbar | Correct shared role variants, preserve32 toolbar API/consumers, small28 and disabled.45; audit touch before claiming phone acceptance | Personal post-fix computed styles;84 scoped tests PASS; no blanket Button adoption PASS | PARTIAL PASS; md role migration owed. Later personal browser: word glyph18/icon glyph20, icon round/border0; neutral hover #EDEFF2, open icon rgba(31,41,55,.16), disabled menu45%. At390 all8 Button examples and all3 menu commands44, page390. Shared control80 tests PASS; not whole-Portal adoption |
| 4b Catalogue goods expansion | 01 §5; ItemRows caller contract | APPROVED VALUE: item sub-header40; contents remain inside table; stepBack only aligns matching tick columns | MEASURED IMPLEMENTATION at1440: parent left154, ItemRows left146.80 (7.20 outside); header32 | Fixed sample: stepBack0 because no item checkbox; child left218.80 inside parent154..1286, header40 | Set this sample ItemRows stepBack0 (no item checkbox); use existing40 header role; preserve shared ItemRows capability for real matching-column consumers | Personal post-fix bounding boxes; source TableExample;84 scoped tests PASS | FIXED LOCALLY |
| 4c Interactive fields on narrow screens | 01 §1/§3; UI §2.2; field-recipe / floating-surface | APPROVED VALUE: mobile/partner hit targets44 minimum; desktop field role32/search34 | MEASURED IMPLEMENTATION before fix: Delivery task date/time/from triggers32 at390. Shared interactive recipe now min-height44 below768; desktop sizes and CONTROL_BASE read-only fact geometry retained | Prior touch fields were below approved hit area. Fix once in controlClass for Input/Select/SearchInput/DatePicker/Textarea and DataTable range controls; Select options also44, disabled45%; DatePicker disabled day has45% and no enabled hover | Personal `/ui`390: all five single fields44, textarea68, three options44, disabledoption aria-disabled/opacity.45, page390;1440 all sample single fields32. Actual full Delivery review at390: date/time/from and both Save/Cancel44, page390, date focused. Initial field calendar day/nav32; corrected in row4d. MonitorMonthCalendar has distinct216/28 capability and must be preserved during its mobile adaptation | 65 scoped tests PASS before final height placement from CONTROL_BASE into controlClass (to exclude read-only facts); final49 behaviour tests PASS after placement refinement; design-standard no new violations, lint exit0 (8163 legacy warn-only findings). Application typecheck27093 exit0 during string-only placement refinement | FIXED LOCALLY for measured field controls; calendar/rail and complete-page phone acceptance still PARTIAL |
| 4d Field calendar touch/keyboard | 01 §1; UI §2.2; existing DatePicker/DayPicker | APPROVED VALUE: mobile hit area44 minimum, keyboard selection and return focus; module-specific disabled dates remain | MEASURED IMPLEMENTATION before fix: field calendar day32 and smaller month nav. Private field size adapter now44 below768, same exported skin; Monitor216/28 adapter retained | Small touch targets and keyboard starting on navigation slowed date entry. Apply field-only responsive sizes and DayPicker autoFocus; no date arithmetic or minDate changes | Personal390 pop-up320×346 at x45, day/nav44×44, page390;1440 days32×32. Enter opens on selected19Oct, ArrowRight→20Oct, Enter→Tue20Oct and trigger focus. 50 behaviour tests incl selected-day keyboard/ISO/focus case,5 dialog-container and7 catalogue tests PASS | Final application typecheck33176 exit0; design-standard no new violations; lint36622 exit0 (8164 legacy warn-only findings); Monitor two-month phone drawer remains incomplete, no full phone PASS | FIXED LOCALLY in field pop-up only; Monitor/zoom UNVERIFIED |
| 5 Responsive/zoom | 01 §4; UI §2.2; 03 §10 | APPROVED VALUE: 1025/1164/1440 desktop plus applicable narrow/200% and panel/nav triggers | MEASURED IMPLEMENTATION: `/ui` 1025 document width equals viewport; all 15 catalogue sections width/scrollWidth 977 | SO desktop 3 widths measured. Kit at 390 initially overflowed by 13 from toolbar example; catalogue containment fixed and remeasured page390/toolbar342. Full-page phone/zoom still owed | Walk required widths and available-canvas/panel states; label phone composition gaps unresolved | Personal SO desktop and Kit390 measurements; modal390 x0/width390, Escape returns focus to Open a modal. Real200% remains UNVERIFIED: browser API exposes viewport but no zoom; native Codex access was denied by the tool, so no actual zoom control was available | PARTIAL PASS |
| 6 Components/catalogue | 02 runtime directory; UI §0/§7.7 | APPROVED VALUE: one shared implementation per purpose; retain unique consumer capabilities | MEASURED IMPLEMENTATION: actual DataGrid, COrderLines, controls and TaskView; moved checkout lost the uncommitted complete-page links | Reviewers cannot reach shell/detail/Workspace/Tasks from kit | Restore complete-page links incl SO list, detail, Route/Tasks failure states; label development and standalone Route limits | UiShowcase 7/7 tests PASS after catalogue scroll containment; web tsc exit0 on fixture additions before shared 133eb0177; browser links open actual shell | FIXED LOCALLY; direct-import inventory and API boundary added to existing02. Relative imports, re-exports and complete consumer acceptance UNVERIFIED |
| 6a Visible Kit overview | UI §0; 01 §§1–2; existing UiShowcase | APPROVED VALUE: existing runtime kit remains the one viewable catalogue; 01 owns approved values | MEASURED IMPLEMENTATION: catalogue began with long tables, had no colour/type overview or section navigation. Now18 links target all18 sections,12 swatches read CSS variables and9 type-role samples use runtime classes; existing page heading is the sole20/600 title | The owner could not readily inspect colours/type or reach complete pages. Add samples and local anchors inside existing page, no new kit/master | Personal computed styles: all9 sample pairs match labels; caps11/500 tracking.66px; twelve swatches match current token values. At390 page390 and Typography anchor reaches section y0; all targets exist. Seven catalogue tests PASS incl navigation coverage | Samples are runtime evidence, not complete-page/Portal adoption or font-file loading proof | FIXED LOCALLY; complete coverage still PARTIAL |
| 7 Interactions/states | UI §2.2; 02 contracts | APPROVED VALUE: keyboard/focus return, draft retention, safe cancel/save; distinct loading/empty/denied/failure/conflict | MEASURED IMPLEMENTATION: SO fixture now uses shared TEST feed; supplier task opens Steps, History, Files 3; separate tasks-failed state retains failure | Local task success reachable. Kit modal Enter opens, Escape closes and returns focus at390. Menu↓ opens with Print focused; End selects last; Escape returns invoking button. Kit PDF success renders one1058×1497 canvas; bad PDF shows Could not load the preview + Try again, canvas0. Later task-source check: delivery task Files SO-1362.pdf initially failed because fixture reader absent and Viewer had no retry command; now exact-order reader seeded and existing Button retries same owning load. Personal browser after retry: Page1of1, canvas846×1197. Three source-retry tests PASS (success, repeated failure, closed-file late response). This is fixture evidence, not production document acceptance. Appearance old-focus compatibility, theme-only save, failed-save retry, account switch tested; actual chooser absent. No task saved-result/conflict proof yet | Keep source-scoped TEST fixtures, verify keyboard/focus/draft/conflict and actual document rendering independently | Personal browser: task opens, Steps quantities 6/2/4 and 3/0/3, two history events, SO then PO files; no writes | UNVERIFIED |
| 8 Complete pages | 03 §§2/3/5/8; Orders/Workspace MASTERs | APPROVED VALUE: SO list/detail, Route, Workspace list/open task; Steps/Route/History/Files where source supports them | MEASURED IMPLEMENTATION: after asynchronous seeding settles, SO detail has 2 priced units + 1 gift, two services; total qty 3, RM 4,130; customer facts loaded | Initial DOM briefly showed unseeded defaults; stable view correct. Workspace My/Team and internal Steps/History walked; supplier Files rendering, task Route and full state coverage still owed | Wait for named source facts before measurement; walk Route/Timeline and task sections; standalone Route remains implementation evidence | Personal browser after fixture fix: actual SO Order Route tab renders Goods/Delivery/Payment from seeded source readers. Missing allocation failure retained as route-failed. Other SO IDs return 404 instead of borrowing SO-1319 facts; task-related SO Route still unseeded. SO list entry included. Personal Workspace Team Work table has Assigned to; internal task Steps/History switch; Route/Files explicitly NOT APPLICABLE to internal task. At1025/1164 pick list display:none, task489/628; at1440 pick340/task552; no duplicate shell Tasks, no page overflow | PARTIAL PASS; delivery task Route personally shows PO2of3, GRN1of3, Contact due16Oct, Delivery requested19Oct, Payment HoldRM1250; Files PDF renders after source retry. Supplier files and full saved/permission/conflict states still owed |
| 8a Outright record return | UI §0.2/§6.2 Return context; Orders register; existing DataGrid sessionKey/presentationKey | APPROVED VALUE: return with list context retained; engine owns row focus/expansion/scroll, page owns source scope and controlled pagination | MEASURED IMPLEMENTATION before fix: Payment/Owes2of4 openedSO1282, Back preserved filter but reset1of4/firstSO1277. Caller had no sessionKey and mount reset paging | Lost place after every record. Caller now retains account-scoped tab-lifetime page/pageSize/sort/selection; existing grid session API retains focus/scroll/expansion. No new browser storage or business writer | Personal1440 full keyboard walk: Payment/Owes2of4, End→SO1302 scroll393, Space selects, Enter opens, Back→2of4/selectedSO1302/focussame row/scroll393.5. DescendingSOsort2of4 firstSO1319→record→Back still firstSO1319/descending2of4. Integration tests also cover50rows/page return, scope change→page1 and another account not inheriting page/selection | Seven scoped integration tests PASS including Summary cases; application typecheck59438 exit0; design-standard no new violations, lint30350 exit0 (8164 legacy warn-only findings). Real scrolling is browser evidence, not inferred from JSDOM | FIXED LOCALLY for same-query direct Back; production/other register consumers unverified |
| 8b Outright source-state truth | UI §2.2; Orders ScopeE; readFailureWords/SalesOrderReadFailure; COPY | APPROVED VALUE: failed/refused reads never zero;403 has no retry,500 retries source; loading/true empty/filter empty distinct | MEASURED IMPLEMENTATION before fix: denied list correct/no footer, Summary falsely showed proceeded0/RM0/problems0. Summary now reuses shared failure face and exposes no computed facts on read error | False zero could be read as no business. Parent Summary gates values on its owning order read and uses same canonical retry/refusal as main list | Personal denied1440: both faces refused, no zero Summary facts/no footer/no retry. Failed read1025/1164/1440: page equals viewport, error widths447/480/480, no footer; Summary retry remains failed with no zero facts. Tests cover403/500/loading/true empty Summary | Initial main-list empty defect is corrected by row8c. The compact1025 two-chip aggregate Clear duplication remains an explicit narrow-toolbar failure. | PARTIAL PASS: Summary fixed; see8c for empty-state scope and remaining compact-toolbar failure |
| 8c Outright empty/read recovery | Orders register states; COPY2831–2832; UI §2.2; canonical complete-population hook | APPROVED VALUE: genuine zero differs from filtered empty; unknown total asks unsearched permitted source; Clear filters removes search too; only one Clear control | MEASURED IMPLEMENTATION before fix: zero population showed obsolete No orders match plus pointless Clear filters. Now uses authoritative total, optional enabled fallback on existing reader, pending/error gates, approved empty words and onClearConditions. A same-event router/filter update had reintroduced cleared search; latest-criteria/no-op update guard fixes it | False empty and ineffective Clear blocked recovery. Reuse existing complete reader/query key and caller scope, never infer total from searched rows; preserve account-scoped return context and existing grid | Personal browser: known0→No sales orders yet/noClear; unknown searched0 + unsearched0 gives same at1025/1164/1440, page equals viewport. Unknown searched0 + unsearched72→no-match/Searchchip/oneClear; Clear→72orders/20rows/chip0. First unsearched503→failed/nofooter/noempty; retry→no-match. No business writes | 14 page integration +10 complete-reader +7 catalogue tests PASS; includes delayed fallback,403/no retry,500/same-reader retry, unknown0/nonzero, account isolation, read deduplication and Clear race. Final application typecheck14632 exit0; design-standard no new violations; lint8151 exit0 with8164 legacy warn-only findings | PARTIAL PASS: source truth/recovery locally verified. Follow-on a5f992399 fixes compact duplicate Clear via caller-owned indication, preserving one shared reset door; functional owner reports17 scoped tests PASS and personal1025 browser Clear count1/page1025, same Clear→72orders. Original433/454 narrow-toolbar fit remains a separate blocker. |
| 8d Supplier task document fixture | Purchasing §5.7; existing TaskFiles owning PO print-data reader; PoTemplateData | APPROVED VALUE: files read the owning document; unknown IDs are not substitute records; supplier PO is money-free | MEASURED IMPLEMENTATION: shell lacked PO print-data; shared helper fabricated goods for unknown PO IDs. Known TEST POs now provide the same identity/version/supplier/ordered quantities/ETA to print-data; unknown shell PO/detail-document reads return404 | Missing fixture prevented real PDF walk; invented unknown PO goods hid missing data. Shared helper now returns no records for unknown IDs, document helper null; existing PDF renderer unchanged | Eight bounded fixture tests verify four declared POs, supplier/version/goods/ETA parity, ordered6 rather than remaining4, no monetary total, and four unknown IDs. No browser PDF proof from these tests | Application typecheck29638 exit0. Personal browser at current narrow app viewport: Files→View PO-261001-9001-V2.pdf renders Page1of1 in existing viewer; screenshot master-kit-supplier-po.jpg. Close→History shows sent10:14 and opened10:10, sameV2/StaffA, no writes. Linked SO9101/9102 document reads now explicitly seeded (unknown IDs still404): same PO SKUs split4+2 mattresses and1+2 bedframes, each TEST SO RM600, never root1319. Personal browser SO9101 PDF shows correct customer/5goods/RM600; SO9102 shows its customer/4goods/RM600. SO9101 preview at1440/1164/1025 is880 wide and page equals viewport; Escape returns focus to original View. Ten fixture tests PASS incl aggregate PO/SO quantity parity and total arithmetic; application typecheck33751 exit0. Screenshot master-kit-supplier-so.jpg. Route sources now reuse explicit SO document facts through typed Operation list, PO9001 SupplierPoFact and empty LogisticsCardFacts; unrelated IDs404. Settings deliberately404 so shared documented fallback applies, not a production-settings proof. Personal Route: Proceed5Oct/PO1of1/GRN0of1/Contact17Oct/Requested20Oct/PaymentHold600, both SO choices; SO9102 remains selected after History→Route. Three-width Route274/274/414.80 at1025/1164/1440, page equals viewport. Twelve fixture tests PASS; first typecheck caught missing required empty thread/annotation embeds, corrected; final79069 exit0. Screenshot master-kit-supplier-route.jpg. OpenSO detail now has explicit typed same-order reader (linked orders read-only405 for writes): personal OpenSO9101 shows correct customer/5goods/600 total+balance, original task Route remains open. At1440/1164/1025 detail723.20/588/605 wide, page equals viewport. Fourteen fixture tests PASS; application typecheck99556 exit0. Browser uncovered real missing-fact defect: absent floor/lift displays1/No lift from Workspace draft defaults1238–39, while PDF null means Not recorded. No fake fixture floor inserted; developer confirmed audit lane may repair Workspace/test. Stored-settings fallback is not production-settings proof; full supplier task remains incomplete. Resizing narrow→desktop unmounts the open mobile task/file; draft retention across that breakpoint is UNVERIFIED | PARTIAL: fixture correction only; complete supplier task UNVERIFIED |
| 9a Missing delivery access facts | Orders recorded-fact law; SalesOrderTemplateData nullable delivery; COPY Not recorded | APPROVED VALUE: unknown floor/lift stay unknown; explicit false and1 remain recorded facts; edits keep owning validation | MEASURED IMPLEMENTATION before fix: absent floor/lift seeded draft1/false and showed Floor1/No lift. Draft, snapshot document, historical draft and proposal seed now preserve null; read face uses existing factOf; editor starts empty; header payload preserves null | Default facts could be accidentally written during another correction. Existing draft pipeline now carries null throughout; shared stair calculation runs only with known inputs; canonical required-fact refusals gate non-contact edits |69 scoped tests PASS including real page missing values and historical PDF null/recorded false1; earlier application typecheck31221 exit0; final application typecheck86993 exit0 (already started before the owner stopped further testing; result collected without rerun). Personal OpenSO9101 shows both Not recorded; Edit Floor starts empty, accepts3. Cancel opened the one-change discard question; Discard was then clicked before returning to /ui. No save performed; no broader save-flow PASS | Local repair under verification; no Portal/deployment PASS |
| 9 Ownership | ERP Architecture laws A–D; owning module MASTER; COPY | APPROVED VALUE: module-owned facts/writers/results; Workspace projects actions, never fabricates completion | MEASURED IMPLEMENTATION: gallery uses TEST-only samples; fixture intercepts writes in memory | Fixture success cannot prove permission or persisted business completion | Trace source readers/writers and permission gates; use authorised isolated environment for writes | No production writes performed by audit. Appearance saves through existing authenticated own-profile updater; tests verify theme-only payload and ignore late prior-account answer | PARTIAL PASS; business writers UNVERIFIED |
| 7a Task-wide review keyboard/overlay | UI §2.2; 03 §8; TaskWideSurface existing Save/Cancel-only contract | APPROVED VALUE: full surface over page, return to mounted task, keyboard focus stays in overlay; no accidental draft loss | MEASURED IMPLEMENTATION before fix: hand-written useTaskDesk portal left focus on background Update date and time; no background isolation or scroll lock. Four calling adapters share it | A keyboard user could work in the covered page. Replace portal with existing Modal/DialogFrame task-review variant, preserving full-screen geometry and owning forms/writers; no new Escape/Close bypass | Personal browser:1440×900,1025×900,1164×900 and390×844 review x0/full viewport, page width equals viewport. Date gets initial focus; ShiftTab first→Cancel and Tab last→date; background aria-hidden/scroll-lock present; calendar portals inside review at z30. Escape retains review with Save still enabled after choosing19Oct; owning Cancel returns to Update date and time and unlocks background. `/ui` TEST note remains after Escape; Cancel returns to Open task review. TaskFiles source retry independently rewalked by keyboard, Escape returns to View | DialogFrame4 + dialog-container5 + UiShowcase7 + Workspace11 =27 scoped tests PASS; application typecheck7432 exit0; design-standard no new violations, lint exit0 (8163 legacy warn-only findings). Integration covers draft/Escape/owning Cancel/task remains mounted and unmount lock cleanup; submitting test has no Escape/extra Close bypass. Actual business saved/failure/conflict and Batch/Supplier complete journeys remain unverified | FIXED LOCALLY; full workflow acceptance still PARTIAL. Initial390 field triggers32<44; corrected in row4c. Calendar and full phone acceptance remain owed |


Control and file-recovery slice validation: common controls80 tests PASS; TaskFiles3 tests PASS; web application typecheck (`tsconfig.app.json`, session71824) exit0; design-standard no new violations, lint exit0 with8164 legacy warn-only findings. This does not prove complete Portal adoption or release readiness.

**Existing page follow-on a5f992399 (functional lane):** DataGrid header-filter popup now uses250/clamp8, preserving the distinct picker contract; Outright only signals toolbar-owned Clear for compact+multiple-chip/no-selection cases, so the engine does not duplicate its no-match Clear. Owner-lane evidence:17 bounded tests plus3 engine reruns after the boundary adjustment; personal1025 fixture Clear count1/page1025 and Clear→72orders. This is scoped local evidence, not my repeated full-page testing or a release/production PASS. OriginalPR2086 is being updated as the same DRAFT reviewable application change.

**Owner follow-on · publish then repair existing pages:** docs-only PR2087 publishes the sole MASTER plus root entry and old-path redirects at exacthead77bfb682a; required existing verify/preview checks run normally, no local broad rerun or gate bypass. Pending app PR2086 remains separate. First follow-on repair in `so-detail/ui.tsx`: CInput imports the shared field recipe instead of its local30px/focus−2 skin; CSelect/CDate adapt existing caller APIs to shared KitSelect/DatePicker (hidden duplicate visual label keeps accessible name), including ISO/min date and existing disabled/change callbacks. No writer changed. Personal local page opens the actual shared Lift combobox; screenshot so-master-fields.jpg. No saved business action or whole-page/deployment PASS.

**Latest requested handover complete ·15Oct:** owner explicitly replaced the endless audit/testing approach with “make one master only; set one, I see it later and correct; stop testing.” That baseline handover is delivered: one physical UI/UX rule body, filled value/trigger/component checklist, UX contract, sole-source live catalogue, old rule bodies removed, both local client entry points aligned, scoped commits saved. This closes that requested handover, not the original all-page verification scope. The detailed historical matrix and separate outcomes remain honest: remaining Portal adoption, unpublished changes, deployment and authenticated production verification are not passed or relabelled complete. Future owner corrections change the same MASTER/shared component and the named consumers, not a new kit or a reopened whole-site audit.

**Historical Desktop new-chat entry · 15 Oct · local only at that time:** after developer confirmed no parallel DesktopAGENTS edit, added a bounded pointer at the top of `/Users/chaichiewlim/Desktop/Carres-Portal-v2/AGENTS.md` to the sole current `kit-docs/docs/ui/MASTER.md` and a `git show codex/kit-preview-index:docs/ui/MASTER.md` fallback. Developer also confirmed no parallel DesktopCLAUDE edit; the same bounded current-source pointer was added there for Claude-only startup. Original Desktop text and all existing uncommitted edits were retained; no specification was copied, no source branch was reset. That pointer was unpublished at the time. On 16 Oct the Desktop entry was corrected to the published main authority; its other uncommitted work was preserved.

**Current owner-directed consolidation ·15Oct ·80110b066:** `docs/ui/MASTER.md` is now the ONE physical UI/UX rule document, including the former values/measurements, component and pattern bodies. The old01/02/03 files have had their rule bodies removed and contain navigation only. `/ui` imports only this MASTER. RootCLAUDE/AGENTS point new chats to it (file ownership confirmed by developer); former01/02/03 references mean parts inside this file. Owner delegated set-one-now/correct-visually-later, so existing documented engineering defaults are retained without asking the owner to approve raw pixel lists. Preserve approved Claude design and conforming work; fix named deviations, not blanket-fail the kit. No tests run for consolidation, no main publication or production claim. Earlier split-source descriptions below are historical evidence, superseded by this paragraph.

Catalogue handover, current source `4648366b2`: the former empty 01 §7 lookup is replaced in place by per-item value/trigger/shared-entry tables. UI MASTER §2.2 now has an explicit interaction checklist. `/ui#measurements` and `/ui#ux-rules` render these canonical tables directly through raw source imports, so no second set of measurement values is maintained. The prior short summary cards were replaced, not retained as another specification. Colours include approved default hex values and live shared-token swatches.

Approved values and MEASURED IMPLEMENTATION remain distinct. The current full checklist includes traced role line heights, modal512/600/880 with85vh cap, field10/search12 padding and textarea3-row/6×10 padding as MEASURED values for review, not newly approved rules. Unknown per-component breakpoints/min/max, the cross-family layer contract and existing presentation choices remain explicitly unresolved. Root MASTER now directs each new chat to the filled checklist and requires value/trigger/component/example, using only this existing handoff for deviations.

Owner steering: no more endless test/fixture expansion; show the Kit for review and continue only within that delivery scope. No new test run was used for these documentation/catalogue changes. No approval, main-branch publication, deployment or all-Portal conformance is implied. Desktop uncommitted authority remains preserved; these changes are in the existing `kit-docs` working branch and must be reconciled through the existing delivery lane before other checkouts can inherit them.

**Owner clarification · 15 Oct:** the ONE Master Kit authority is established by UI MASTER +01/02/03 and its `/ui` catalogue. Pages must follow it now; unfinished page adoption, source-state checks or production verification do not put that standard back up for approval. No further TEST fixture expansion is required to hand over the established standard. The detailed matrix below/above remains the implementation evidence; do not collapse it into a misleading all-green claim.

**Separate delivery outcomes, reconciled 16 Oct:** consolidated kit baseline documented and published — YES (#2087); all optional kit gaps decided — NO;
local component/full-page coverage complete — NO; Portal migration complete — NO;
this audit change deployed — NO; authenticated production verified — NO.
Existing Batch B release evidence above keeps its original limited scope and is not re-labelled by this audit.

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
   feed with a closure receipt. PostgreSQL and PostgREST are now available locally (15 Oct; no Docker). The internal
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
   **Local real-date slice PASS (15 Oct, no application change):** synthetic legacy fixture task
   present → existing `/api/orders/:id/date` HTTP 200 → same source task absent → one actual
   `completed` ledger row with fixture actor and `orders.delivery_date=2026-12-01`. Actual Hono
   route/auth, generated local ES256 tokens, Supabase clients, PostgREST 16.4 and PostgreSQL 17.11;
   no mocked source facts or inserted completion row. This proves only the source API/projector/
   ledger path, not browser UI, deployed Worker, whole feed or the blocked `not yet` outcome.
   Replay applied 666/685 migrations, with 19 unrelated failures; no full-replay PASS is claimed.
   Temporary local HTTP/database services stopped; fixture cluster preserved. The authorised
   production `not yet` write is **BLOCKED BY CONTRACT CONFLICT**, not awaiting repeat permission.
3. **Batch D · SO Batch brief.** A confirmed: preserve the existing deadline rule, no code change.
   B preserves existing authority; C remains a proposal (§5). Only unavoidable conflicts go through the controller; batch approved changes into one release.
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

### SO Batch design brief 14 Oct — current dispositions; remaining proposals are NOT LAW

**A · `Order PO deadline` on a group row — CONFIRMED 15 Oct 2026, no code change**
- Jess confirmed through `Create Claude design checklist`: keep the earliest Order By among
  outstanding lines, including an already overdue unpurchased line. Each line keeps its own deadline.
- Reject replacing it with the nearest non-late date. A future date must not hide buying already late.
- Trial-data age is not a reason to change the rule. Purchasing MASTER §9.1 remains the authority.

**B · `Status` on a group row — existing authority preserved 15 Oct 2026**
- Controller disposition: no policy change authorised; preserve the existing any-passed-line rule and do not add `Order now`. This is not a new owner approval or a delivery gate.
- Existing rule (§9.1): "`Cut-off passed` (amber) with what is still to buy, when a line's PO window has gone by; otherwise `To buy`."
- Proposed: `Cut-off passed` only when every open line is past its cut-off; otherwise `Order now` when anything is due today or late.
- Consequence: a group with one passed line and nine on time reads `Order now` instead of `Cut-off passed`; `Order now` is not a COPY word (COPY status words: `To buy` · `Cut-off passed` · `Late to order` · `Partly ordered` · `Ordered` · `From ready stock`).
- Recommendation: keep `Cut-off passed` when any line's window has passed (it is the fact the buyer must act on today), and use the existing `Late to order` when the Order By date has passed; reject `Order now`. Falsifier: Jess rules the group status must describe the majority of its lines.

**C · Today card numbers — existing authority preserved 15 Oct 2026**
- Controller disposition: preserve distinct PO-window and Order By definitions. Park the optional additive-number/headline proposal; no business change or new owner vote is required to continue.
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
