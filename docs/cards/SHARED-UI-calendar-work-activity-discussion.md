# 【SHARED UI】— Discussion Card · Calendar / My Work / Activity

**PROPOSAL / NOT APPROVED · PLAN / DESIGN · 24 September 2026**

One discussion Card, no build sequence or implementation authorization. Review attachment: [viewable layouts](../ui-reference/shared-panels-review.html). All examples are fictional. This Card is research and a complete design recommendation, not replacement law. No application files, business records, permissions or production deployment were changed.

## 1. Owner review in one minute

**Recommendation:** retain three small, read-only doors with different jobs: **Calendar = dated operations; My Work = my Missed/Today counts; Activity = recent changes across permitted Sales Orders.** Every record opens its real owner. Make scope and data health visible before counts. Keep individual order **History** inside the order.

Current → problem → better design → trade-off → recommendation:

- 🔴 Calendar and Activity can turn a failed read into an empty answer. Show unknown/error separately from a verified empty result. This costs one status line; it prevents staff treating missing information as no work.
- 🔴 My Work's panel names a failed source while its icon can still announce an unqualified zero. Give panel, badge and accessible name the same health state. Preserve genuinely last-safe counts with their timestamp; never present partial counts as the complete total.
- 🟡 Calendar event cards look clickable but are not links. Use one explicit owner link per entry. This adds a line but removes the need to search for that record elsewhere.
- 🟡 Activity truncates the change and actor/date, exposes internal filter words and silently changes scope. Keep its global Sales Orders scope stable, show readable change/actor/result ranks, and link directly to object History. The operator makes one deliberate navigation instead of falling into another hidden feed.
- 🟡 Side-panel controls lack consistent focus/close behavior and are smaller than the frozen 40px target. Admit a shared non-modal rail shell and improve the existing calendar/control recipes once. Do not draw a private component per panel.

**Do not reopen:** Work ownership, working-day calculations, completion facts, permissions or the approved Missed + Today focus window. No task editing, schedule dragging, new reminders, manual Done, or Order Route redesign.

## 2. Evidence and authority resolution

### Evidence boundary

FACT: primary checkout is `docs/delivery-03-closure` at `c194a8915`, with unrelated changes. Its rail and Workspace documents are older than current main. The existing clean review worktree `.worktrees/shared-rail-plan` is at `3aa6e5a98` (same as the inspected `origin/main`). This review uses that worktree's authority and code. The neighboring `.worktrees/rail-panels` is a build branch; it was inspected read-only. No duplicate combined discussion Card was found in either worktree's current cards. The old activity-actor bug Card is a different, narrower delivered change.

FACT: read `AGENTS.md` → `CLAUDE.md` → ERP architecture → UI MASTER §5 and mandatory §§6.7–6.10 → Workspace MASTER §§5,7–7.1; relevant Delivery §§5,8.2,10, Purchasing §§9.4,10, Orders object History/numbering; COPY-STANDARD; 01 tokens, 02 components, 03 patterns and Action Flow. The later Workspace §7 replaces the older local draft's Late/Covering counts with **Missed + Today only**. Team duty editing now belongs in Staff & Duties. UI §5's four-slot inventory is stale relative to the measured three-slot implementation and newer duty authority; this review does not restore Team.

| Classification | Finding / boundary | Primary authority or evidence |
|---|---|---|
| RESOLVED FROM AUTHORITY | Modules write their own facts; shared views read/link only | ERP-ARCHITECTURE §§0.1,1; UI MASTER §5 |
| RESOLVED FROM AUTHORITY | My Work peek shows only nonzero Missed + Today; one cache/identity/focus; Open My Work; no mobile mini-queue | Workspace MASTER §§7–7.1 (lines 893–945) |
| RESOLVED FROM AUTHORITY | Actual date spelling; history may group Today/Yesterday/Earlier; raw enum/field words prohibited | COPY-STANDARD date and no-internal-enum rulings, lines 2833+,3271+ |
| RESOLVED FROM AUTHORITY | Delivery and transfer are different facts and counts; recorded dates must not be moved to working days | Delivery §8.2, Purchasing §10 |
| BUILT / SOURCE + FIXTURE VERIFIED | Shared Work cache, count links, loading placeholder and panel source-health text exist | `TasksPanel.tsx:32`, `use-open-work.ts:132`, fixture walk below |
| BUILT / SOURCE VERIFIED | Actor-name resolver is already shared; do not re-report the retired direct app_users lookup as current | `apps/api/src/routes/operation/activity.ts:55` |
| APPROVED TARGET / INCOMPLETE IMPLEMENTATION | Read failure never means zero; refused permission hides counts; rail links preserve source via Back | Workspace §§7–7.1; icon health gap remains |
| REAL GAP / CONTRADICTION | Shared rail width is 340px in actual component and production evidence, old layout record says 320, generic side-panel token says 420 | `OperationRightRail.tsx:64`; `design-standard.ts:160`; tokens §8. Propose retaining observed 340 as explicitly admitted rail recipe; no global 420 token change |
| REAL GAP / CONTRADICTION | Frozen minimum target is 40px, Button md is 32px/sm 24px; MonthCalendar days are 30×36px; no shared Side Panel exists | tokens §9; `Button.tsx:44`; `MonthCalendar.tsx:65`; components “Not built” |
| NEW PROPOSAL | Stable Activity scope, shared health presentation, owner event links, accessible rail shell and narrow Calendar/Activity presentation | §§5–8 below; not approved truth |

### Direct inspection versus limitation

- **Live production observation:** authenticated Chrome, `/operation/orders`, 24 Sep 2026. Three icons and the `My Work · 0 missed · 0 today` accessible name were visible. Calendar accessibility tree showed September, actual-day chips and `No dated events this day.` The actual absence of events was **not verified against authoritative records**. Native browser control became inconsistent; no claim of a complete production walk, successful retry, or production role matrix is made.
- **Direct fixture inspection:** used the already-running, pre-existing audit harness at `localhost:5447/rail-audit-preview.html`; it mounts the real components at the reviewed commit and intercepts API reads with fictional records. The harness was not authored or modified in this task. Walked populated Calendar, Activity, My Work; partial-source My Work; first-load-error Calendar and Activity; Escape from My Work. Fixture checks prove rendering/interaction, not production data or permissions.
- **Reported only:** Order Route session error and ineffective retry. `apps/web/src/lib/api.ts:28–38` already clears a staff token for the declared session-required 403; this does not prove the reported case recovers. Keep it an existing auth/Route defect for BUILD, not justification for a Route redesign.
- **Not tested:** actual keyboard focus return after production navigation, VoiceOver speech, all roles, 200% production zoom, long-list performance, source completeness, midnight/session transition, dirty form plus real deep-link. These remain explicit acceptance limits.

## 3. Top-to-bottom audit

| Area | Current evidence | Severity and correction |
|---|---|---|
| Entry icons | Correct CalendarDays, ListTodo, ScrollText; 36px buttons; title-only tooltip; selected fills differ by panel | 🟡 Keep glyph meanings; 40px targets, focusable Tooltip, common blue selection, aria-expanded/controls and textual health |
| Header | 48px header, 15px title; 24px close hit area; no scope/freshness region | 🟡 Retain title scale; 40px close; put scope and observation state directly below header |
| Open/switch/close | One panel at once; panel subtree unmounts on switch; Escape did nothing in fixture | 🟡 Remember date/filter/scroll within session; Escape closes when focus is inside rail, returns to trigger; ordinary page interaction remains usable |
| Calendar source | `CalendarPanel.tsx:85–89` discards query health; `?? []`; delivery booking adapter; receiving uses etaDate or expectedReadyDate | 🔴 Never equate unresolved/failing sources with empty. Supplier expected-ready is not automatically physical arrival; read owner arrival projection and label its actual date basis |
| Calendar count | Adds PO entries and order bookings; canceled assumption in comment; no range completeness metadata | 🔴 Count distinct authorized event identities; separate delivery/transfer/arrival counts. Query date range, never infer full month from current register subset |
| Calendar navigation | Month arrows only change grid; old selected agenda can stay on another month. Actual-day chips are good | 🟡 Changing month selects first day of that month; heading always matches selection. Chips restore their date/range and visible month |
| Calendar destinations | Fixture populated rows are divs, not links; raw supplier id fallback appears | 🔴 One owner link per event, governed missing-name words; no opaque id. Preserve delivery slot AND explicit confirmed/provisional meaning |
| Calendar color | Receiving heading green, Deliveries blue, black active range | 🟡 Neutral category headings. Color denotes selected state or confirmed/warning facts, never a category |
| My Work data | Same authoritative feed and selector; current panel is already counts only | KEEP. No row preview, priority picker or due-date editor |
| My Work failure | Partial fixture: Payment failed + last updated; icon still announces `1 missed · 0 today`; partial branch has no retry | 🔴 Shared health state, qualified stale totals only, retry for all recoverable failed branches |
| Activity scope | `GlobalActivity.tsx:24` changes active-order store; rail chooses AnnotationTimeline when order id exists | 🟡 Stable global scope; source-number link opens owner's History; no invisible global→object scope switch |
| Activity search/filter | Local filtering over up to 200 merged rows; Module select has no effect; Type uses raw category keys | 🔴 Remove inert Module select; readable Type/Person values; show recent-window scope. Search beyond loaded subset requires bounded server result, not false “Nothing matches” |
| Activity text | Unknown field fallback at `activity-display.tsx:222`; unknown status raw fallback at :123; details truncated on one line | 🔴 Registered formatter and safe Activity fallback; readable three-rank rows with no loss of number, actor or time |
| Activity history | Existing object timeline has lifecycle/annotation writing; object History is separate | 🟡 Shared feed remains read-only. Preserve note capability in its owning authorized object surface; do not copy its composer into shared Activity |
| Activity actor/time | Actor resolver exists; UI omits missing actor; grouping uses browser local day | 🟡 Distinguish proven System from unavailable actor. Malaysia timestamps/groups consistently; no invented actor |
| Empty / error | Failed Calendar = `No dated events this day`; failed Activity = `Nothing matches` in fixture | 🔴 Gate emptiness on healthy, complete authorized scope; separate filtered empty and failures |
| Narrow / large content | Fixed 340+52 rail consumes 392px; no responsive logic inside rail; long Activity row visibly clipped | 🔴 Hide desktop strip when it cannot coexist; narrow My Work uses existing Work destination; proposal for Calendar/Activity outlined below |
| Permissions | Activity uses operation/principal guard + caller RLS; browser filtering is not authorization | KEEP server boundary. Counts/search/facets must use same authorized scope; permission revocation purges private cached contents |
| Unsaved work | Panel peeking itself does not navigate; record links can leave page; production dirty guard not walked | 🟡 Peek/switch/close never saves/discards. Actual navigation passes existing dirty guard; cancel keeps source and destination intent unchanged |

## 4. Reference-to-Carres capability matrix

All external findings below are **documentation-based**, checked 24 Sep 2026. No authenticated Outlook, Linear or Dynamics product was inspected. Documentation images are supporting evidence, not a Carres usability test. Summaries intentionally stay small; linked primary pages carry details.

| Reference pattern | Evidence/source | Carres current / owner | Keep/adapt/reject | Operator benefit | Trade-off / dependency |
|---|---|---|---|---|---|
| Outlook My Day opens from other areas; date selection, event detail, full event door | [Microsoft My Day](https://support.microsoft.com/en-us/outlook/calendar/use-my-day-with-to-do-in-outlook) | Global Calendar; Delivery/Receiving | ADAPT date → readable event → owner link | Find exact booking without searching main list | No new event form or duplicate editor |
| Outlook keyboard opening and moving to full Calendar | [Microsoft accessibility guide](https://support.microsoft.com/en-us/accessibility/outlook/use-a-screen-reader-with-my-day-in-new-outlook) | Shared shell | ADAPT focus entry/return; do not copy shortcut keys | Keyboard access to the same useful doors | Carres nonmodal behavior must be verified |
| Linear separates assigned work, created/subscribed work and activity; prioritizes focus work | [Linear My issues](https://linear.app/docs/my-issues) | Workspace Work | KEEP personal scope; REJECT copying extra personal tabs and Linear priority taxonomy | Preserve the approved simple Missed/Today doorway | Full queue owns Carres priority and working dates |
| SAP collapsible side content, icon/title/close, main content coexistence | [SAP Fiori Side Panel](https://www.sap.com/design-system/fiori-design-web/v1-136/ui-elements/side-panel/) | Shared rail | ADAPT composition/focus; REJECT default 320px and SAP restriction against global navigation | Consistent closing and orientation | Carres explicitly permits global quick peeks; SAP page-only restriction is not Carres law |
| Dynamics timeline typed filters, clear filters, sorting and record context; user-dependent visibility | [Microsoft timeline](https://learn.microsoft.com/en-us/power-apps/user/add-activities) | Shared Activity and object History | ADAPT clear filters + actor/time + authorized context; REJECT inline creation/pinning/bookmarks here | Recover a specific change and read who did it | More surface area than a clipped sentence; no second audit store |
| Google Calendar makes timezone explicit | [Google time zones](https://support.google.com/calendar/answer/37064?hl=en-419) | Calendar dates and event timestamps | ADAPT explicit Malaysia business clock; REJECT automatic viewer-local date movement | Same truck/arrival stays on same business day | Remote staff read business time rather than travel-local time |

Capability disposition: KEEP peek, chips, month navigation, Work links, chronology, search/Type/Person. IMPROVE health, focus, event links, labels and pagination boundary. RELOCATE complete history/notes and work execution to owning destinations. RETIRE inert Module selector and implicit scope switch. BUILD only missing reusable shell/health/calendar capabilities after approval. No bulk actions, scan/import, print/export, copy, reschedule, per-panel Settings or new personal reminder system: those belong to source objects or full operational destinations.

Skills: UI/UX Pro Max searches `keyboard focus modal` and `error recovery loading feedback` returned relevant UX results (visible focus, recovery, stable busy feedback). Design-critique applied purpose/hierarchy/usability/consistency. Accessibility-review applied contrast, keyboard, labeling, focus and reflow. Its 44px target note is WCAG 2.1 AAA, not AA; Carres' frozen 40px minimum is retained. No generic palette or design-system generator replaces Carres tokens.

## 5. Recommended complete panel design

### Shared shell and session behavior

**RECOMMENDATION:** one non-modal desktop rail recipe, observed 340px body + 52px strip. This width is a proposal to settle the measured width inconsistency, not a silent token override. Header 48px: existing 18px icon, 15/22 semibold title, 40px close target. Body 16px padding, 12px gaps, 24px between major blocks; scope/freshness in 12/16 secondary ink. Neutral surfaces; blue only selection/primary action; red only a real urgent/failed fact. No ornamental category colors.

Icon click opens the selected panel; click again closes; another icon switches it. Header stays fixed, one body scroll area; no page scroll and no nested Calendar scrolling trap. Opening places keyboard focus on panel heading; next Tab reaches first control. No desktop focus trap. Escape closes from inside panel; a nested popover consumes Escape first. Closing returns focus to opening icon. Switching retains per-panel filters, chosen day and scroll in the current session. Logout clears them and data; no cross-user persistence. Refresh never resets selection or steals focus.

Scope is explicit and stable across module/object navigation. No permissions expansion: an unavailable source is named without exposing forbidden object/count data. The shell is a projection container, not a new global module destination.

### Calendar — “Which dated movements can I open?”

Order of content:
1. Header `Calendar`, close.
2. Scope line **Deliveries · Supplier arrivals**; Malaysia time and last successful observation. Copy additions are proposed in §8.
3. Existing actual-date chips for current business day, next calendar day and `This week`. The week retains existing defined span, not a new rolling-seven-day promise. Show its exact start/end alongside or in focusable tooltip.
4. Month caption with Previous/Next (one month), then full month on shared calendar engine. Selected day is blue; current day outline is separate. Arrows select first day of newly visible month; one actual-day selection and range selection are mutually exclusive. Month selection carries matching agenda heading.
5. Picked date/range and **separate factual counts**: customer deliveries, transfers if present, expected supplier arrivals. A marker's accessible label states full date and the same breakdown; day with unknown source says count unavailable, never zero. No unread badge on Calendar icon.
6. Agenda grouped by actual date, then type. Each event: complete document reference + party at 13px; date/slot and explicit state at 12px; optional logistics/location at 12px; one owner link. Long required facts wrap. No event edit, completion checkbox or nested clickable card.
7. Module-level links `Delivery schedule` and `Receiving` only when authorized. Preserve range at destination visibly; event link carries exact stable source id, not a text search.

Data contract: source owners supply dated events, stable identity, category, actual date basis, authorization, destination and observation/completeness. Delivery reads the same source as current Delivery schedule, preserving final deliveries versus transfer legs and confirmed/provisional state. Never infer physical movement from promised SO date, PO issue date, status=delivered, or stock quantity. Receiving uses governed expected supplier-arrival facts; if only a factory-ready date exists, do not relabel it as an arrival. An unscheduled source is absent from dated counts but its Work obligation remains in main Work. One SO may have several dated legs; don't collapse them into one SO event. Supplier arrival count is occurrences/commitments, not units; display units separately only when authoritative.

Recorded date-only values remain their source business day. Timestamps display Asia/Kuala_Lumpur; holidays affect computed Work dates, never move a supplier's recorded promise. Midnight refresh updates chips/current-day marker; deliberately picked dates remain picked. Invalid/missing dates are named in owner view, never assigned today. Full source range and authorization must be known before a healthy zero is shown.

### My Work — “What needs my attention now?”

Use the **already approved Workspace §7 design**, not the old Late/Covering proposal:
1. Header `My Work`, close.
2. Health/freshness line; healthy last observation is secondary, failure appears first.
3. Nonzero **Missed** count, then nonzero **Today** count, 13px rows with tabular figures and explicit accessible action count. Missed uses red text; numbers never become an assignment button.
4. `Open My Work` at the bottom of this short content, not pinned to the bottom of an almost empty screen.

Missed → `/operation?tab=work&scope=mine&day=missed`; Today → the **same workFocusDay** date used by main Work; Open My Work → `/operation?tab=work&scope=mine`. Main Work owns the visible removable filter, action priorities, due dates, cover identity and exact owner destinations. Do not reinterpret Today as UTC midnight or force a new today calendar calculation.

The collapsed badge keeps the approved **Missed + Today** number. Red when Missed>0, otherwise neutral; zero has no badge. Exact full count remains accessible if visual badge is 99+. If any source is incomplete and no complete last-safe snapshot exists, withhold numeric total and say refresh failed in the accessible name. If a complete permitted older snapshot exists, display it only as last updated, including that qualification in icon name/tooltip. Both peek and main Work must show the same observation, never separately recomputed totals. Manager identity still opens My Work, not Team Work.

### Activity — “What changed across Sales Orders?”

1. Header `Activity`, close.
2. Persistent scope `Sales Orders` plus proposed recent-window text and observation time. This does not claim every ERP module is covered. Opening an order must not silently narrow it.
3. One labeled SearchInput (`Search order, customer, or staff…`), then Type and Person selects. Use registered labels (Alerts/Notes/Milestones/Money/Changes/Stock/System), not category keys. No inert Module select while only one module source is admitted. Active conditions and `Clear filters` appear only when narrowed.
4. Today/Yesterday/Earlier groups, latest first, stable event-id tie-break. Each row: event title 13/18 semibold; actor + authorized role if provided + exact time 12/16; important before/after/result 11/14 normal; source number + party as a visible link. No raw payload/field/status, no fabricated role or actor. Unknown taxonomy uses governed `Activity`; unknown field detail is withheld and reported to engineering, never de-underscored.
5. Source link opens **that object's History**, with event anchor where supported, using existing navigation/dirty guard. It does not set activeOrder behind the page. Object History retains the complete ledger, revisions stay separate. Proven system event says System; unresolved actor is labeled unavailable, never falsely attributed to System.
6. `Load more` for an explicit bounded recent window (proposed last 30 Malaysia days), preserving query/filter and stable pagination. Search/filters apply to the entire authorized window, not just the latest loaded 200. Once exhausted, state end of that window and link to source History for earlier records. No new global audit/report page.

Long change details wrap; large notes disclose `Show more` inline without navigation; source link remains separate. No note editor, pinning, marking read, export or task completion in this shared preview. Existing note capture remains available through its authorized owning surface; the later build must establish that destination before removing any existing access path.

## 6. Full interaction and state contract

| State / event | Calendar | My Work | Activity |
|---|---|---|---|
| First loading | Keep header/date controls; Loading skeleton for counts/agenda, aria-busy; no zero | Existing labels/placeholders, no badge number, Open My Work remains | Keep labeled controls; Loading rows; no empty statement |
| Healthy populated | Typed counts and source-linked events | Only nonzero Missed/Today | Readable chronology; source links |
| Healthy empty | No dated events for exact successful range; source doors remain | `No work due now`; Open My Work remains | No recorded activity in explicit window; do not say no business activity exists |
| Filtered empty | Selected category/date named; reset selection available | Full Work owns filters, not rail | `Nothing matches` + Clear filters, window still visible |
| Initial failure | No counts, named failure + Try again | Existing `My Work could not be refreshed` + Try again | No empty list claim; named failure + Try again |
| Partial source failure | Healthy event groups can remain, failed category unknown, no complete aggregate | Complete old snapshot qualified or unknown total; never partial zero | Failed event stream is named; no complete search result claim |
| Stale / offline | Last safe permitted events + Last updated; no “current” capacity claim | Same qualified old snapshot in icon/panel/main | Existing rows with stale line; new events not implied absent |
| Refresh / recovered | Busy retry control; replace with authoritative counts; retain date/focus | Reconcile shared snapshot once; restore healthy counts only after completeness | Preserve search/scroll; deduplicate event ids; polite recovery announcement |
| 401 / expired staff session | Use existing sign-in/re-PIN gate, preserve permitted draft/return location; no endless blind retry | Same | Same |
| Permission refused/revoked | Hide unauthorized objects and counts, including cached data; explanatory refusal | No stale personal counts after identity/permission change | Server-scoped query and facets; no private actor/object leakage |
| Source deleted / inaccessible | Owner route gives honest unavailable/refused state; not a dead chevron | Main Work revalidates action | Preserve permitted historical text; link only to legitimate target, no broken pretend action |
| Month/day navigation | Grid and agenda share selected date/range; preserve after retry | No independent date control | No calendar bolted onto feed; recent window explicit |
| Long / large list | Required ids/parties wrap; paged source events with complete count, no arbitrary silent cap | Two counts remain bounded; main queue handles scale | Cursor paging, stable chronology, expandable long note; search entire window |
| Switch / close / return | Preserve panel state in session; return focus | Same | Same |
| Dirty object | Peek does not save/discard; owner navigation uses existing guard; cancel leaves draft intact | Same | Same |
| Reordered/rescheduled source | Owner invalidates projection; event moves to actual new day once, old date becomes History | Source closes/moves work; peek never marks done | Immutable change added; historical record not rewritten |
| Narrow and zoom | Proposed Calendar option in existing shell menu opens full-width kit Drawer; source links remain | **No narrow rail/drawer**; existing Work destination opens main My Work | Proposed Activity option in existing shell menu opens full-width kit Drawer |

Narrow composition activates when the main canvas cannot remain usable with 392px rail; propose below desktop-min-width 1024, and for zoom-reduced CSS viewport. No permanent floating rail. Calendar/Activity drawer uses existing modal focus trap/backdrop and returns focus to menu trigger; My Work follows locked no-mini-queue rule. At 320/390px, labels and controls stack, no horizontal page scroll, one vertical body scroll. Required targets 40px. This new Calendar/Activity menu placement is a proposal, not existing authority.

## 7. Kit versus module responsibilities; exact visual contract

| Element | Existing contract / exact recommendation | Ownership / gap |
|---|---|---|
| Desktop panel shell | 340px measured rail, 52px strip, 48px header; nonmodal semantics | **Proposed kit admission:** shared RailPanel recipe; Side Panel is currently listed unbuilt. Generic Drawer remains 420px; do not overwrite it |
| Narrow Calendar/Activity | Existing Drawer/DialogFrame behavior, width constrained to viewport | Kit adaptation only; never apply to My Work |
| Type scale | Heading strong 15/22/600; event title body 13/18/600; actor/time and scope meta 12/16/400; event result label 11/14/400 | Existing tokens, no new sizes. 13/12/11 History grammar per tokens §1 |
| Spacing | Body p-4=16; control gap-2=8; row/section gap-3=12; major blocks gap-6=24; icon gap-1.5=6 | Existing scale. Remove present 14/10px ad hoc padding |
| Surfaces | White; slate-5 border; slate-6 section divider; slate-12 primary and slate-11 secondary; slate-3 hover; blue-3 selected with slate-12 text | Existing Radix token values. Neutral event-category icons; green only confirmed fact, amber only provisional/stale warning |
| Controls | Button neutral md for retry, ghost md for close/refresh; SearchInput and Select; Tooltip; Loading; EmptyState; Panel | Button md **actually 32px**, not 40. Propose one kit-owned ≥40px hit-target recipe, retaining typography/radius; no local per-panel CSS fix |
| Calendar | Reuse DayPicker engine from MonthCalendar; date markers and selection | Existing MonthCalendar assumes Warehouse/Sunday and 30×36 cells: **not drop-in ready** for mixed sources. Proposed kit context-neutral markers, 40px targets, full-date/count aria; owners supply calendars |
| Health | Scope + observation + failed-source text composed with existing EmptyState/Loading/Button | Proposed reusable read-state recipe; no need for new decorative Alert, Badge tone or Toast |
| Event row | Existing History text grammar, separate source link, optional detail disclosure | Shared renderer; module supplies event taxonomy, formatting and authorized destination |
| Work counts | Existing shared selector/response; badge accessible count | Workspace owns timing/identity; shell owns health presentation, never Work arithmetic |
| Calendar truth | Booking/arrival/transfer source facts | Delivery and Receiving/Purchasing own event meaning, date and completeness |
| Permissions | Server grants + RLS, same across count/list/filter/link | No new permission tier or broadened access is proposed |

**Capability readiness:** Work count projection is READY to reuse; generic controls/History formatting are READY with named defects. Keyboard calendar engine is COPY REQUIRED from existing kit, with the explicit mixed-source/touch adaptation above. Reusable desktop shell/read-health recipe is a LOCAL KIT GAP, not proof that nobody has solved side panels. Complete Calendar event coverage and bounded Activity server search remain NOT VERIFIED / source-contract gaps; do not label them invented-engine work or promise production readiness.

## 8. Proposed copy and component admission (one review, not a sequence of questions)

Existing wording is reused wherever available. These exact new phrases/uses are **PROPOSED COPY / NOT LAW** in the viewable mockups: `Malaysia time` · `Deliveries · Supplier arrivals` (scope) · `{n} customer deliveries · {n} transfers · {n} expected supplier arrivals` · `Calendar could not be refreshed` · `Activity could not be refreshed` · `Counts unavailable` · `Recent 30 days` · `No activity recorded in these 30 days` · `No more activity in these 30 days` · `Person not available` · `Sign in again` (only when existing auth gate establishes that remedy) · `Show more` / `Show less` for a long event detail · `Load more` for the bounded feed. `Last updated`, `Try again`, actual dates, My Work/Missed/Today/Open My Work, Delivery schedule, Receiving, History and Clear filters reuse governed vocabulary/owner contracts. No production word is admitted by this Card.

Component request is explicit: admit RailPanel and shared read-state recipes; extend the existing kit calendar/controls for the named context and target sizes. No new palette, font, radius, source assignment or application implementation is requested.

## 9. Critique, revision and score

Initial recommendation was challenged before presentation: (a) discarded the old local Late/Covering design after reading main; (b) removed a tempting mobile My Work drawer because Workspace §7 prohibits it; (c) removed inert Module filtering rather than invent an all-ERP feed; (d) retained delivery/transfer distinction; (e) rejected adding a second event editor; (f) identified 340/320/420 width and 32/40 target mismatches rather than silently styling around them; (g) chose server-window search instead of calling the latest 200 records a complete result.

Scores are **evidence-weighted design review**, not measured usability. Untested portions receive no perfect mark. Current score combines source and fixture evidence at `3aa6e5a98`, not a blanket score for every production role.

| Criterion (2 each) | Current | Proposed | Evidence / remaining limitation |
|---|---:|---:|---|
| Operator clarity | 1.0 | 1.7 | Current three clear icons but hidden Activity scope/raw words; proposal explicitly names scope and state. New-hire comprehension untested |
| Workflow completeness/destinations | 0.8 | 1.7 | Work links exist; Calendar has none; Activity changes local feed. Proposal gives owner doors but full destination/dirty-guard walk owed |
| Data truth/scope/failure | 0.5 | 1.6 | Fixture failure-as-empty and unqualified partial badge demonstrated. Proposal separates states; actual source completeness/permission recovery unverified |
| Visual consistency/readability | 0.9 | 1.7 | Current screenshot clipping/ad hoc colors; proposal uses frozen ranks/spacing. Long-name/real-font/zoom production proof owed |
| Accessibility/responsive | 0.6 | 1.5 | Fixture Escape failure, short targets and unlabeled input; proposal specifies focus and mobile model. Kit admission, screen-reader and rendered target verification owed |
| **Total /10** | **3.8** | **8.2** | **10/10 is the target, not a claim.** No operator-tested result yet |

Measured static color-pair contrast from installed `@radix-ui/colors` values (not a production screenshot audit):

| Text pair | Foreground / background | Ratio | 4.5:1 normal text |
|---|---|---:|---|
| primary | #1c2024 / #ffffff | 16.39:1 | PASS |
| secondary | #60646c / #ffffff | 5.94:1 | PASS |
| selected, revised | #1c2024 / #e6f4fe | 14.62:1 | PASS |
| warning | #ab6400 / #ffffff | 4.61:1 | PASS |
| missed | #ce2c31 / #ffffff | 5.21:1 | PASS |
| confirmed | #218358 / #ffffff | 4.72:1 | PASS |

Self-critique found blue-11 text on blue-3 selected fill at **4.25:1**, below 4.5. Revised selected text to existing slate-12 (no token value changes); blue-3 still marks selection. This correction is reflected in the viewable proposal.

Accessibility correction map: search name → WCAG 3.3.2/4.1.2; selected/calendar date state → 1.3.1/4.1.2; keyboard opening/closing → 2.1.1/2.4.3; visible focus → 2.4.7; unreadable contrast → 1.4.3; narrow/200% reflow → 1.4.4/1.4.10. Frozen 40px is Carres target; 44px is not mislabeled as WCAG 2.1 AA. No claim of accessibility conformance without assistive-technology testing.

Falsifiers / acceptance boundaries:
- If a source-matched comparison shows a dated movement absent/duplicated or a partial response rendered as zero, the design fails data truth.
- If the icon, panel and main Work disagree for the same user/snapshot/focus, the peek fails; fix projection/health, not the numbers cosmetically.
- If five unfamiliar operators cannot identify scope, stale state and correct destination without explanation, revise hierarchy/copy before claiming clarity.
- If Tab/Enter/Escape/Back loses focus, dirty input or chosen date/filter, the interaction is not accepted.
- If 1440/1180/1024/820/390/320 CSS widths or 200% zoom clip required identity/date or hide a recovery control, revise composition using the same tokens.
- If authorized actor/event or source History access disappears when replacing the legacy timeline, retain the existing door until the owning destination supports it.

## 10. Review boundary and next action

**No new business-rule decision is needed.** The owner review is the complete presentation proposal, its listed copy and reusable-component admissions. Genuine unresolved engineering verification (Calendar zero truth, source completeness, auth recovery, exact event anchors) is not an interview question for Jess.

This Card does **not** authorize the new design, a build Card sequence, production changes or Order Route redesign. Existing failure/label/keyboard bugs may be coordinated with the current BUILD owner under existing rules; no message was sent in this task.

After owner approval: overwrite the affected current UI §5 and component/copy contracts, preserve Workspace §7's approved semantics, label design targets versus unbuilt work accurately, then prepare the requested handoff. Until approval, **PLAN remains in owner review; not PLAN MISSION COMPLETE, not READY FOR CARD.**

### Artifact validation record

24 Sep 2026: opened the standalone review HTML in the in-app browser; checked populated rendering, switched to healthy empty and first-load failure, and selected narrow composition. The first-load-error calendar announces unavailable counts; all three proposed panels show recovery instead of empty success. These checks validate the illustration, not a working production implementation. The narrow switch is a composition example; actual 320/390 viewport and screen-reader verification remain owed. The HTML is intentionally a lightweight review artifact, not production component code: date/week/month and destination buttons simulate or explain their intended behavior.
