# 【SHARED UI】 — DISCUSSION CARD · Quick Rail: Calendar · My Work · Activity

**Module:** Shared ERP UI (portal shell right rail) · **Surface:** `OperationRightRail` and its three panels
**Lane:** PLAN / DESIGN — discussion Card. **No application code, no production change.**
**Status:** **PROPOSAL / NOT APPROVED.** Nothing below binds until Jess approves the complete package.
**Date:** 2026-09-24 · **Base:** `origin/main` `3aa6e5a98`
**Viewable layouts:** https://claude.ai/artifact/RZbw8Ut4rpdDZoTDRL4RU2 (current vs proposed, every state; fictional data; private until shared).
**Bug-fix coordination:** local branch `build/shared-rail-panels-recovery` (worktree `.worktrees/rail-panels`,
created 2026-09-24 10:58, no commits yet) is treated as the current BUILD owner for the existing defects
in §4. This Card does not touch it.

---

## 1 · Authority read and resolution pass

Read: `CLAUDE.md` · `AGENTS.md` · `docs/ERP-ARCHITECTURE.md` §2.1 (Quick Rail governed by UI MASTER) ·
`docs/ui/MASTER.md` §5 (the right rail), §5 two-line / three-rank grammars, §6.7 shell ·
`docs/workspace/MASTER.md` §5, §5.7, §7, §7.1 · `docs/delivery/MASTER.md` §10 ·
`docs/COPY-STANDARD.md` (Right Rail words, NO RELATIVE DATE WORDS + history-group exception,
NO INTERNAL ENUM, `—` ruling, rail calendar words) · `docs/01-design-tokens.md` §§1–3 ·
`docs/02-components.md` (Panel, EmptyState, Loading, MonthCalendar, "Not built: Side Panel").

| Fact | Class | Evidence |
|---|---|---|
| The rail is a quick peek; it never becomes a second writer or a second home for business truth | **RESOLVED FROM AUTHORITY** | UI MASTER §5 frozen rules; ERP-ARCHITECTURE §2.1 |
| Team slot retired; three slots remain (Calendar · My Work · Activity) | **RESOLVED FROM AUTHORITY** | Workspace MASTER §5.x production note ("Quick Rail Team/duty editor have been removed"); `OperationRightRail.tsx:18` |
| My Work slot = counts-only doorway: non-zero `Missed` + focus-day counts, `Open My Work`, no rows | **RESOLVED FROM AUTHORITY** | Workspace MASTER §7, §7.1 |
| My Work loading keeps placeholders, never `0`; failure keeps last-safe counts + time; never a clear state | **RESOLVED FROM AUTHORITY** | Workspace §7; COPY `Right Rail refresh failure` |
| Narrow widths: no global Right Rail; the Work destination is the one replacement door | **RESOLVED FROM AUTHORITY** | Workspace §7, §8.4 |
| My Work wears the Work destination icon (`ListTodo`) | **RESOLVED FROM AUTHORITY** | UI MASTER §5 (owner ruling 2026-08-15) |
| Calendar day comes from the BOOKING; actual weekday+date, never `Today`/`Tomorrow`; `This week` is the only span word | **RESOLVED FROM AUTHORITY** | UI MASTER §5; COPY NO RELATIVE DATE WORDS |
| Activity previews append-only events and links to their objects; never replaces an object's History; no enum or `—` on screen | **RESOLVED FROM AUTHORITY** | UI MASTER §5; COPY NO INTERNAL ENUM |
| Activity history groups `Today · Yesterday · Earlier` are allowed (the one exception) | **RESOLVED FROM AUTHORITY** | COPY, "THE ONE EXCEPTION … a HISTORY group" |
| History/record grammar 13 / 12 / 11 (what · who+when · result) | **RESOLVED FROM AUTHORITY** | UI MASTER §5 three-rank grammar |
| Colour has four jobs; blue = primary action + current selection only; hover grey | **RESOLVED FROM AUTHORITY** | Tokens §2.2–2.3 |
| Calendar shows contact deadlines, handover deadlines, Failed Delivery follow-up, return due dates | **APPROVED TARGET / NOT BUILT** | Delivery MASTER §10 "Calendar Quick Rail" |
| Activity shows Delivery assignment/arrangement/contact/handover/result/proof events | **APPROVED TARGET / NOT BUILT** | Delivery MASTER §10 "Activity Quick Rail" |
| HF-3 one identity, one focus day, one `Missed + Today` count for badge, panel and Work | **BUILT / VERIFIED** | PR #1406; `my-work-counts.test.tsx`; fixture walk below |
| A dated action deadline on the Calendar double-counts what Work already counts | **REAL GAP / CONTRADICTION** | Delivery §10 (deadlines on Calendar) vs Workspace §1 (one Work coordination surface, one occurrence counted once) — §8 |
| My Work row prints `Today` alone; the focus day can be the next working day | **REAL GAP / CONTRADICTION — resolvable from authority** | Workspace §7 sketch `5 today` vs COPY portal-wide ban; the Payment Monitor ruled pattern (date + `Today` marker) resolves it — §6.2 |
| A right-side panel frame does not exist in the kit | **REAL GAP** | `02-components.md` "Not built: … Side Panel" |

## 2 · How the audit was measured

- **Code read** line by line: `OperationRightRail.tsx`, `rail/CalendarPanel.tsx`, `rail/TasksPanel.tsx`,
  `GlobalActivity.tsx`, `AnnotationTimeline.tsx`, `activity-display.tsx`, `use-open-work.ts`,
  `routes/operation/activity.ts`, `queries.ts` reads.
- **Rendered walk:** the REAL `OperationRightRail` mounted in a temporary local fixture harness
  (fetch stubbed; fictional data; never committed) at 1280×820 and 390×800, scenarios populated ·
  empty · all-failed · one-source-failed.
- **Not measured:** production (sign-in required; credentials are never entered by an agent), screen
  reader audio, real operators. Every such item is marked **UNVERIFIED** in §9.

## 3 · Top-to-toe audit — current (Version N)

🔴 = wrong truth, dead end or blocked operator · 🟡 = friction / inconsistency. Every item carries its fix.

### 3.1 Shell (icon strip + panel frame)

| # | Finding | Evidence | Fix |
|---|---|---|---|
| S1 🔴 | At 390px the 340px panel + 52px strip exceed the screen: the strip and the panel's close button are pushed off-screen | fixture walk 390×800 | Rail absent below 1024px (Workspace §7); overlay mode 1024–1279 (§6.1) |
| S2 🔴 | `Escape` does not close the panel; focus is not returned to the icon on close | fixture: panel still open after `Escape` | `Escape` closes, focus returns to the opening icon |
| S3 🟡 | Icons expose no state: no `aria-pressed`/`aria-expanded`, tooltip is `title` (hover-only) | fixture a11y read: `pressed=null expanded=null` | Toggle buttons with `aria-pressed` + `aria-controls`; kit `Tooltip` on hover **and** focus |
| S4 🟡 | Each icon's active colour is a different hue (blue / amber / grey) — decoration by hue | `OperationRightRail.tsx:23–34` | One selection state for all: `blue-3` fill, `blue-11` icon (Tokens §2.3) |
| S5 🟡 | Panel header is 48px (`h-12`); the page header is 50px (UI MASTER §6.7) — the two rules never line up | `OperationRightRail.tsx:61` | 50px header row |
| S6 🟡 | Off-token spacing: 14px (`p-3.5`, `px-3.5`); 8px `rounded-lg` | same file | 16px body padding, 12px gaps, `rounded-card` / `rounded-control` |
| S7 🟡 | No panel says its SCOPE or FRESHNESS; Activity silently switches from "all orders" to "one order" | code + fixture | One scope line under every header: what the panel covers · `Updated {time}` |
| S9 🟡 | Strip buttons are 36px; the frozen minimum target is 40px | `OperationRightRail.tsx:98` `w-9 h-9`; Tokens §9 | 40px buttons (the 52px strip still fits) |
| S10 🟡 | Width contradiction: the panel is 340px, Tokens §8 says `side-panel-width 420` | `OperationRightRail.tsx:58`; Tokens §8 | Keep 340 for the rail and record it in Tokens §8 as `rail-panel-width 340` — 420 + 52 would take a third of a 1440 screen from every Register. **Token-value change → part of the approval.** |
| S8 🟡 | Header docblock still describes "Keep notes / Follow-ups / 60-min SLA" | `OperationRightRail.tsx:11–24` | Rewrite with the build (stale comments mislead the next chat) |

### 3.2 Calendar

| # | Finding | Evidence | Fix |
|---|---|---|---|
| C1 🔴 | **No loading or failure state.** While loading and when every read fails, each day prints a (transparent) `0` and the agenda says `No dated events this day.` — a failed source shown as an empty day. This is the reported "zero events unverified" | fixture `s=error`: agenda `THU, 24 SEP · No dated events this day.`; code has no `isLoading`/`isError` branch | Loading skeleton; `Calendar could not be loaded · Try again`; per-source partial failure; grid counts hidden, never `0` |
| C2 🔴 | Event rows are not clickable — the calendar answers "when" and then leaves the operator stranded | fixture: 0 links/buttons inside the agenda | Every event row is one link to its exact owning record; each group has one `Open in …` door |
| C3 🔴 | Supplier falls back to the first 8 characters of a raw id (`5f1c2b7a`) | fixture; `CalendarPanel.tsx:74` | Server returns the supplier name; absent → the governed `Supplier not assigned` |
| C4 🔴 | Deliveries come from the Orders list read, capped at the newest 500 orders by placed date — an older order booked this week can vanish | `orders.ts:353` `.limit(500)`; `CalendarPanel.tsx:57` | A date-window calendar read (month in view) served by the owning modules, not the list page's first page |
| C5 🟡 | Business day is the browser's local clock (`new Date()`), not the portal's governed day | `CalendarPanel.tsx:151` | Use the server's governed business date (`generatedOn`, as Work does) |
| C6 🟡 | Missing customer prints `—` | fixture (SO-4103) | `Customer name not recorded` → **new COPY word, needs the dictionary entry** |
| C7 🟡 | Hint text says `Pick a day, or Today / Tomorrow / This week.` — banned words | `CalendarPanel.tsx:324` | Remove: a day is always selected, so the hint has no state to serve |
| C8 🟡 | Day buttons read `24 3` to a screen reader; no date or noun | fixture a11y read | Use the kit `MonthCalendar`: its aria-label says the date and the count in words |
| C9 🟡 | Hand-rolled month grid duplicates the kit `MonthCalendar` (Receiving, Delivery Monitor already use it) | `components/kit/MonthCalendar.tsx` | Adopt the kit component; no second calendar engine |
| C10 🟡 | Carrier load row `NETS   2` has no noun; `Confirmed` vs `Logistics' date` meaning lives in a hover `title` | fixture; `CalendarPanel.tsx:408` | `NETS · 2 booked` / `2 of 8 booked`; meaning on the face, not in hover |
| C11 🟡 | Month caption uses the browser locale (`toLocaleDateString(undefined, …)`) | `CalendarPanel.tsx:176` | Kit caption (`SEPTEMBER 2026`) |
| C12 🟡 | Today ring and `Open My Work` use `primary` = flame `#C44D2B`, next to the danger red — two reds, neither meaning "late" | `index.css:28`; Tokens §2.1 names `primary = blue-9` | Kit `MonthCalendar` tokens as shipped (selected day `blue-9` fill); today marked by a neutral ring |
| C13 🟡 | Kit `MonthCalendar` day buttons are 30×36px, below the 40px target | `MonthCalendar.tsx:62`; Tokens §9 | Accepted for the dense desktop rail (the rail does not exist below 1024px); record the exception in the kit entry rather than widening the grid past 340px |

### 3.3 My Work

| # | Finding | Evidence | Fix |
|---|---|---|---|
| W1 🔴 | **One source failed → counts look complete.** Badge accessible name says `My Work · 1 missed · 0 today` while Payment could not be refreshed; the `0` is not proven. This is the reported "refresh failure with zero-count label" | fixture `s=partial` | Badge and rows say the counts are incomplete and name the missing source; no `0` in any accessible name while a source is unhealthy |
| W2 🔴 | Refresh failed with cached zero counts: panel prints only the failure line, but the badge name still says `0 missed · 0 today` | `OperationRightRail.tsx:48` (`hasData` only) | Accessible name follows the same health rule as the panel |
| W3 🟡 | One source failing prints `My Work could not be refreshed` — over-states; the feed did refresh | fixture `s=partial` | Headline only on a whole-feed failure; a source failure says `Could not refresh Payment` + `Other work is current.` (both already in COPY) |
| W4 🟡 | Second row prints `Today` alone; the focus day can be the next working day after a holiday, so the word can be false | `TasksPanel.tsx:35`; `workFocusDay()` | Print the focus date (`Thu, 24 Sep`) with the ruled `Today` marker only when it IS today (Payment Monitor pattern) |
| W5 🟡 | `Open My Work` renders as flame-coloured text inside a bordered box — neither a kit Button nor a link style | fixture | Kit `Button` secondary, full width |
| ✅ | Single identity, focus day and count shared with Work (HF-3); counts open URL-visible filters | `my-work-counts.test.tsx`; fixture links `day=missed`, `day=2026-09-24` | KEEP |

### 3.4 Activity

| # | Finding | Evidence | Fix |
|---|---|---|---|
| A1 🔴 | `Type` filter lists raw category keys: `exception · note · milestone · money · edit · stock · system` (the reported "internal field names") while the per-order chips already use the translated labels | fixture; `GlobalActivity.tsx:84` vs `activity-display.tsx:38` | Use `CATEGORY_LABEL` (`Alerts · Notes · Milestones · Money · Changes · Stock · System`) |
| A2 🔴 | `Module` filter is inert (no `onChange`) and lists one module — a control that lies | `GlobalActivity.tsx:90` | Remove until a second module feeds Activity; then wire it |
| A3 🔴 | A failed read prints `Nothing matches.` — failure shown as "no match" | fixture `s=error` | `Activity could not be loaded · Try again` |
| A4 🔴 | Clicking a row does not open the record: it silently rescopes the rail to that order, with a 5-step lifecycle stepper (`Placed → Delivered`, raw hex colours) that contradicts the Order Route, and a note-writing form | fixture; `AnnotationTimeline.tsx:29–110, 222` | Row opens the record's History on its object page; retire the rail's per-order mode and stepper; relocate the note door (§6.3) |
| A5 🟡 | The `when` fact is truncated off the row (`Thu, 24 Se…`) | fixture 1280px | Three-rank grammar; who+when on its own line, never truncated |
| A6 🟡 | True empty feed also prints `Nothing matches.` | fixture `s=empty` | `No activity yet` vs `No activity matches these filters · Clear filters` |
| A7 🟡 | Window is hidden: the read takes the latest 150 of each source and says nothing | `activity.ts:35` | Scope line: `Latest 300 events` (the true window) |
| A8 🟡 | Exception rows paint raw Tailwind red (`bg-red-50/60`, `text-red-700`) | carry-forwards `red-is-doing-more-than-one-job` | Kit red only for act-now alerts; otherwise neutral |
| A9 🟡 | Body sentence joined with ` — ` into the title and clipped to one line | `GlobalActivity.tsx:158` | Result on line 3, wraps to 2 lines |

### 3.5 Reported observation outside this surface

**Order Route session error with ineffective retry** — not reproduced here (Order Route is behind sign-in
and is outside this Card's surface; redesigning Order Route is excluded by the brief). Handed to the BUILD
owner as a defect to diagnose; it is not scored below.

## 4 · Existing defects the BUILD owner may fix now (no design approval needed)

Each breaks an already-locked rule, so it is a defect, not a design change:
C1 · C3 · C6 (needs its COPY word) · C7 · C8 · A1 · A2 · A3 · A6 · W1 · W2 · W3 · S2 · S3.
Everything else in §6 is new design and waits for approval.

## 5 · Reference study

See §10 (primary vendor documentation; access limits stated there).

## 6 · RECOMMENDED CARRES QUICK RAIL — PROPOSAL / NOT LAW

### 6.1 Shell — one frame, three contents

```
┌ strip 52 ┐   ┌ panel 340 ─────────────────────────────┐
│ [Cal]    │   │ ▣ Calendar                        [×]  │  50px header · text-strong 15/600
│ [Work]⁽³⁾│   │ All Carres · deliveries & arrivals     │  scope line · text-meta 12 · slate-11
│ [Act]    │   │                       Updated 10:42    │  freshness right-aligned
└──────────┘   ├────────────────────────────────────────┤
               │ body · 16px padding · 12px gaps        │
               │ state slot: loading · empty · failed · │
               │ partial · stale                        │
               └────────────────────────────────────────┘
```

- **Kit request — `RailPanel`** (the kit's listed "Side Panel" gap): header (icon · title · close),
  scope line, body, and five state slots built from existing kit `Loading` (skeleton) and `EmptyState`
  (title · detail · one action). The three panels supply content only. **Needs owner approval to join
  the kit** (Constitution §2).
- Strip buttons: 40px (Tokens §9); `aria-pressed`, `aria-controls`; kit `Tooltip` on hover and focus.
  Selected = `blue-3` fill / `blue-11` icon for every slot. Badge only on My Work (resolved).
- Keyboard: `Escape` inside the panel closes it and returns focus to its icon; clicking another icon swaps
  content and keeps focus on that icon (disclosure pattern); the panel is a labelled `complementary` region.
- Width: ≥1280px the panel pushes the page (today's behaviour). 1024–1279px it floats over the page on
  the kit floating surface, so a Register keeps its width. <1024px the rail is absent (resolved) — My Work
  stays reachable from the left `Work` door; Calendar and Activity have full homes (Delivery Monitor,
  Arrival Schedule, object History).
- Every rail link uses in-app navigation, so a page with unsaved changes can intercept it; the rail itself
  holds no unsaved state once the note form leaves it (§6.3).
- The last-open panel is remembered for the browser session only; no page opens the rail by itself.

### 6.2 My Work (content resolved; presentation corrected)

```
My Work                                   [×]
Work routed to you              Updated 10:42
┌──────────────────────────────────────────┐
│ Missed                              1  › │   danger label · tabular count
│ Thu, 24 Sep  [Today]                2  › │   focus date + marker only when it is today
└──────────────────────────────────────────┘
[ Open My Work                             ]   kit Button, secondary
```

| State | Shows | Badge accessible name |
|---|---|---|
| Loading | both row labels, count placeholders; `Loading work` (sr) | `My Work` |
| Healthy, work due | non-zero rows only | `My Work · 1 missed · 2 on Thu, 24 Sep` |
| Healthy, clear | `No work due now` + button | `My Work · no work due now` |
| One source failed | amber `Could not refresh Payment · Last updated 09:00` · `Other work is current.` · counts | `My Work · 1 missed · 2 on Thu, 24 Sep · Payment not refreshed` |
| Feed failed, cached | `My Work could not be refreshed · Last updated 09:00` · last-safe non-zero rows · `Try again` | `My Work could not be refreshed` |
| Feed failed, nothing held | failure line · `Try again` · button | `My Work could not be refreshed` |
| Permission refused | no counts, no rows; button only if Work is permitted | `My Work` |

Clicking `Missed` → `/operation?tab=work&scope=mine&day=missed`; the date row → that day's filter;
the button → unfiltered My Work. Browser Back returns to the page the operator came from (resolved).

### 6.3 Activity (always ONE scope: the business, never "this order")

```
Activity                                  [×]
All Sales Orders · latest 300     Updated 10:42
[ Search order, customer or staff         ]
[ Type ▾ ]  [ Person ▾ ]         4 of 120 · Clear filters
TODAY
 ◉  Status changed · Placed → Proceed          13 semibold   what happened
    Aina · Thu, 24 Sep 10:06                   12 slate-11   who · when (never truncated)
    SO-4101 · Ahmad Rahman                  ›  11 normal     record · customer
 ◉  Note · Follow up
    Ben · Thu, 24 Sep 09:12
    Customer asks for delivery after 3pm, nobody
    home before then …  · SO-4102              wraps to 2 lines
YESTERDAY
 ◉  Unit flagged for repair
    Staff identity not recorded · Wed, 23 Sep 10:06
    No order
```

- Row click → the record's object page, History section (`SO-4101` → Sales Order page › History). The
  rail never rescopes itself; the object page is the one per-record history (UI MASTER §5).
- **RETIRE** from the rail: per-order timeline mode, the lifecycle stepper (Order Route is the authority),
  the note form. **RELOCATE** the note door (`Add note` with `Follow up · Escalate to Jess · Resolved`) to
  the Sales Order page History section — Orders owns it. Cross-module consequence: Orders must gain that
  door **in the same slice** the rail loses it, so the capability (and Jess's escalation inbox) never has a
  gap.
- Filters: Search · Type (translated labels) · Person. Module appears only when a second module feeds
  Activity (Delivery §10 target). Active filters show `{n} of {total} · Clear filters`.
- States: loading skeleton (3 rows) · `No activity yet` · `No activity matches these filters · Clear filters`
  · `Activity could not be loaded · Try again` · partial `Notes could not be loaded` while events show.
- Groups `Today · Yesterday · Earlier` stay (history exception); every row still prints its full date.

### 6.4 Calendar (company scope; commitments that happen on a day)

```
Calendar                                  [×]
All Carres · deliveries & arrivals  Updated 10:42
[Thu, 24 Sep 3] [Fri, 25 Sep 1] [This week 5]    kept chips (owner rulings 2026-08-15)
          SEPTEMBER 2026                         kit MonthCalendar
 S  M  T  W  T  F  S                             count under the day; aria "Thu, 24 Sep — 3 events"
 …        24ring  25                              kit as shipped: selected = blue-9 fill, white text
                   3     1
THU, 24 SEP · 3 EVENTS
DELIVERIES · 2                      Open in Delivery ›
 ▌SO-4101                     12pm–3pm (Confirmed)
 ▌Ahmad Rahman
 ▌NETS · Petaling Jaya                             ›
 ▌SO-4102                          Logistics' date
 ▌Mei Tan
 ▌NETS · Petaling Jaya                             ›
 NETS · 2 booked
SUPPLIER ARRIVALS · 1          Open Arrival Schedule ›
  PO260924-1001               3 units
  Supplier not assigned                            ›
```

- Delivery row → the Delivery Monitor with that delivery selected (Delivery owns the arrangement).
  Arrival row → the Warehouse Arrival Schedule on that day with the PO selected (Receiving owns arrival).
  Group door → the same destination for the whole day.
- States: loading (grid numbers visible, counts as placeholders, agenda skeleton) · failed
  (`Calendar could not be loaded · Try again`; grid counts hidden) · partial (`Supplier arrivals could not
  be loaded · Try again` while deliveries show) · empty day `Nothing booked for Thu, 24 Sep` · empty range
  `Nothing booked this week`.
- Data: one date-window read per source for the month in view, on the governed business date.
- **Content boundary depends on the one owner decision in §8.**

### 6.5 UI Kit versus module rules

| Belongs in the kit | Belongs to the owning module |
|---|---|
| `RailPanel` frame, header, scope line, five state slots (**new — approval**) | What each source counts, its words and its destination |
| `MonthCalendar` (existing) with count + aria sentence | Delivery: booking day, confirmed vs logistics' date, carrier load |
| `EmptyState`, `Loading` skeleton, `Button`, `Tooltip`, `SearchInput`, `Select` (existing) | Receiving/Warehouse: expected arrival day and units |
| Rail strip toggle semantics, `Escape`/focus return, width modes | Workspace: My Work counts and focus day (already one selector) |
| Three-rank record row (the History grammar as one shared row) | Orders: event taxonomy and translated labels; the note door |

### 6.6 New words this proposal needs in COPY-STANDARD (proposal)

`Customer name not recorded` · `Calendar could not be loaded` · `Supplier arrivals could not be loaded` ·
`Nothing booked for {date}` · `Nothing booked this week` · `{partner} · {n} booked` · `{n} of {cap} booked` ·
`All Carres · deliveries & arrivals` · `Work routed to you` · `Updated {time}` ·
`Activity could not be loaded` · `No activity yet` · `No activity matches these filters` ·
`Notes could not be loaded` · `All Sales Orders · latest {n}` · `Open in Delivery` · `Open Arrival Schedule`.
Existing words reused unchanged: `Try again` · `Clear filters` · `Other work is current.` ·
`Could not refresh {source}` · `Last updated {time}` · `No work due now` · `Open My Work` ·
`My Work could not be refreshed` · `Staff identity not recorded` · `No order` · `Supplier not assigned`.

## 7 · Intentional rejects

- **Outlook/Google "Today" button and relative dates** — rejected; Carres names the actual day.
- **An action list inside the rail** (Linear/Asana style rows) — rejected; Workspace §7 keeps rows in Work.
- **Per-record activity inside the rail** (Dynamics timeline pattern) — rejected here; the object page owns
  record History. The Dynamics lesson is applied on the SO page instead.
- **Calendar event creation / drag-to-reschedule** — rejected; the rail never writes, the owning module does.
- **A mobile drawer for the rail** — rejected; resolved by Workspace §7.

## 8 · The one owner decision

```
DECISION     Does the Calendar show ACTION DEADLINES, or only COMMITMENTS that happen on a day?
AUTHORITY    Delivery MASTER §10 (Calendar shows contact deadlines, handover deadlines, Failed
             Delivery follow-up, return due dates) · Workspace MASTER §1/§5.1 (one Work surface; each
             occurrence counted once) · UI MASTER §5 (rail never a second home for truth) ·
             CalendarPanel.tsx:113 ("Calendar counts only authoritative dated events, never action queues")
WHY OPEN     Two approved sources disagree: a contact deadline is a Work action with its own Missed/day
             count; putting it on the Calendar prints the same obligation in two places with two counts.
OPTIONS      A · Commitments only — booked delivery, supplier arrival, partner pickup/handover, loan
                 return due. Calls, follow-ups and deadlines stay in My Work.
             B · Commitments + action deadlines, as Delivery §10 says today.
RECOMMEND    A. One obligation, one count, one place: the Calendar answers "what happens on this day",
             My Work answers "what must I do". Mature calendars (Outlook, Google) keep tasks in a
             separate To Do/Tasks list beside the calendar for the same reason.
CONSEQUENCE  Operators check Work for calls, Calendar for trucks and arrivals. Delivery MASTER §10's
             Calendar line is overwritten on approval. Nothing changes in Work.
FALSIFIER    If operators, in a walk, look for "who to call today" on the Calendar and miss it in Work,
             B is right.
```

## 9 · Score (10-point rubric) — critiqued and revised before presenting

| Category (max) | Current | Evidence | Proposed | Why not full marks |
|---|---|---|---|---|
| Operator clarity (2) | **0.5** | raw enums (A1), hidden scope switch (A4), `Today` label (W4), no scope lines | **1.5** | Not tested with an operator — UNVERIFIED |
| Workflow completeness & destinations (2) | **0.5** | Calendar rows dead (C2); Activity row rescopes instead of opening (A4); My Work doors correct | **1.5** | Delivery/Arrival destinations need a "selected record" deep-link the target pages may not yet accept — UNVERIFIED; §8 open |
| Data truth, scope & failure (2) | **0.5** | false empties C1/A3, incomplete counts W1/W2, 500-order cap C4, UUID C3 | **1.5** | Date-window reads and governed business day are specified, not built; partial-source composition for Calendar/Activity is new server work |
| Visual consistency & readability (2) | **0.5** | off-token 14px/8px, 48 vs 50 header, flame primary, raw hex, `slate-400` (#9CA3AF, 2.5:1) captions | **2.0** | All values are existing tokens; `RailPanel` awaits kit approval |
| Accessibility & responsive (2) | **0.5** | 390px overflow S1, no Escape S2, no pressed state S3, `24 3` day names C8 | **1.5** | No screen-reader or keyboard walk with real AT — UNVERIFIED |
| **Total** | **2.5 / 10** | | **8.0 / 10** | A critical open item (§8) and untested usability keep it below 10 |

**Cross-check:** a second session ran this same brief in parallel and wrote `docs/cards/SHARED-UI-calendar-work-activity-discussion.md` (uncommitted). Its token findings (40px target, 420 side-panel width, kit day size) were verified and folded in above as S9, S10, C13. **Only one Card may survive** — see the owner note.

**Critique round applied before this version:** (1) first draft kept a `This order` chip in Activity — removed,
it rebuilt the duplicate History; (2) first draft let the rail float at all widths — changed to push ≥1280 so
Registers keep today's behaviour where there is room; (3) first draft printed `0` rows in My Work for symmetry —
removed, Workspace §7 admits non-zero rows only; (4) first draft coloured the delivery status bar by itself —
the status word stays on the face so colour is never the only signal.

## 10 · Reference lessons

**Access, stated honestly.** Pages were read from vendor documentation on 2026-09-24; no product was
operated hands-on. **SAP Fiori** pages (notifications, dynamic side content, illustrated message, timeline,
busy indicator) returned HTTP 403 — only a search snippet for the busy indicator was seen, so no SAP lesson
is load-bearing. Google's Calendar-in-Gmail page and Asana's Inbox page were thin.

| Reference pattern | Evidence / source | Carres current | Keep / adapt / reject | Operator benefit | Trade-off |
|---|---|---|---|---|---|
| Outlook My Day: the pane names the date at the top and that date IS the navigation; the pane says which calendars it shows | support.microsoft.com "Use My Day with To Do in Outlook" (doc) | Chips name dates ✅; no scope line | **Adapt** — keep date chips, add the scope line | Knows what the calendar covers without asking | One more line of height |
| Outlook My Day: calendar and tasks are separate tabs of one pane | same (doc) | Calendar and My Work separate ✅ | **Keep**; basis for §8 option A | One obligation lives in one place | Calls not visible on the Calendar |
| Outlook: selecting an event opens its detail, with "View full event" | same (doc) | Calendar rows dead | **Adapt** — row opens the owning record directly (no preview layer) | One click to the record that can act | No in-rail preview |
| Outlook/Google "Today" button, relative words | doc | banned in Carres | **Reject** — COPY portal-wide ruling | — | — |
| Linear Inbox badge derives from the same inbox list | linear.app/docs/inbox (doc) | HF-3 one selector ✅ | **Keep** | Badge never disagrees with Work | — |
| Linear My Issues fixed focus order (urgent → blockers → …) | linear.app/docs/my-issues (doc) | Work v4 owns ordering | **Reject for the rail** — ordering lives in Work | — | — |
| Linear snooze / mark read | linear.app/docs/inbox (doc) | none | **Reject** — a peek never writes | One form per act (Law C) | — |
| Asana replaced fixed Today/Upcoming/Later buckets with date-based rules | asana.com "customize My Tasks" (doc) | Calendar uses real dates ✅ | **Keep real dates**; supports the relative-word ban | Buckets that rot overnight disappear | — |
| Dynamics 365 timeline: filter icon changes when filtered; refresh; "Open Row" per item; per-row modified time | learn.microsoft.com power-apps "add activities" (doc) | Activity filters show no active state; no open-record click | **Adapt** — `{n} of {total} · Clear filters`, row opens record, time on every row | Never mistakes a filtered list for the whole | — |
| Dynamics global timeline differs per signed-in user | same (doc) | Activity scope unstated | **Adapt** — scope line states the population | Knows why a colleague sees more | — |
| Dynamics record timeline inside the record | same (doc) | rail rescopes to one order | **Relocate** — record history belongs on the object page | One History, no duplicate | Rail loses its per-order mode |
| WAI-ARIA Disclosure (`aria-expanded`, Enter/Space) | w3.org APG disclosure (spec) | no state exposed | **Adopt** for strip buttons | Screen reader knows what is open | — |
| WAI-ARIA date grid: each day named in full; Escape returns focus to the opener | w3.org APG datepicker dialog (spec) | day read as `24 3`; no Escape | **Adopt** via kit `MonthCalendar` + panel Escape rule | Keyboard operators can use the rail | — |
| Google side panel collapses the whole strip; research suggested a full-width overlay on narrow screens | support.google.com (doc) + research inference | overflow at 390px | **Reject overlay on phones** — Workspace §7 already rules the rail absent; **adopt** overlay only at 1024–1279 | No squeezed Register | Calendar/Activity need their full homes on a phone |
| SAP busy indicator: local, delayed ~1 s, no flicker | search snippet only (blocked) | — | **Not relied on** | — | — |

Lessons applied: say the scope · name the real day · group by real dates · row opens its record · keep
failure apart from empty (no reference documents this; Carres law already requires it) · show freshness ·
never print `0` while unknown · one count source · disclosure semantics + Escape · full day names.
