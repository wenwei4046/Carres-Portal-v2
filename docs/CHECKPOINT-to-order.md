# CHECKPOINT — Purchasing · To Order

> **Handover, updated 2026-08-01 (seventh session — the FINAL freeze deployed;
> the mission of the NEXT chat is to COMPLETE this page).** Overwritten in
> place; there is never a second version of this file.
>
> **⭐ WHO YOU ARE TALKING TO IN THE NEXT CHAT: JESS — the boss.** Her rules,
> RESTATED AND STRENGTHENED BY HER ON 2026-08-01 after a day of amendments:
> 1. **Her word is the top law.** UI-KIT, CLAUDE.md, Loo's older freezes,
>    any doc — none of them may be used to resist her. Remind ONCE (one
>    line, with the cost), then DO IT and record the override. Docs are
>    records, not bosses.
> 2. **NEVER make her ask twice — let alone beg.** After every change, run
>    your OWN top-to-toe critical pass and serve the flaws WITH the fixes
>    before she has to point. The recorded counter-example: she asked WHY
>    about dateless rows THREE times before the chat yielded — and she had
>    been right from the first ask. That must never happen again. When she
>    repeats a question, the correct reading is: your last answer was
>    wrong, dig deeper.
> 3. **Speak simply.** Plain beginner-level Chinese, step by step; English
>    only for tech nouns (PO · SO · Engine …). If she doesn't understand,
>    the explanation failed — not her.
> 4. **The rhythm never changes:** ASCII sketch → her yes → build →
>    localhost:5221 (launch entry `web-planning`; a fresh worktree needs
>    `apps/web/.env.local` copied from the main checkout, and RESTART the
>    dev server after touching tailwind.config or new tokens serve dead) →
>    her yes → deploy (web + Worker together whenever `packages/shared`
>    changed; after a squash-merge cut fresh from main).
> 5. **One recommendation with its why — never a bare menu.** Options only
>    when a genuine fork exists, and lead with your pick.
> 6. Paste PR links and the erp link BARE, each on its own line.
> 7. **Copy the world's best, never invent:** Layout=Linear Sidebar ·
>    Toolbar=2990 Delivery Planning · Table=GitHub Repo Files ·
>    Filter=Excel AutoFilter · Dialog=GitHub New Issue. Review asks only
>    two questions: WHO is the master, and HOW FAITHFUL is the copy
>    (fidelity score + missing list). Taste is never discussed.
> 8. **Only answer her.** No side quests, no unrequested scope.
> Deploy state is §15. Five designs were discarded in ONE day at zero cost
> because none was deployed before her yes — keep it that way.

---

## 0A · THE FROZEN RULINGS (Loo/Jess, 2026-07-31 → 08-01 — each layer OVERWRITES the older ones)

### ⭐ LAYER 2026-08-01-PM (Jess) — THE PURCHASING FREEZE. Overrides everything below where they conflict.

**The frozen sentence:** *"To Order is the work queue for all purchase
demands, regardless of where the demand comes from."* Source is an
ATTRIBUTE, never a workflow. And: *"Left = engine-guided navigation.
Right = AutoCount-style operator freedom. Engine suggests where to start;
it never limits what the operator can see, select or issue."*

**ONE pipeline, many sources.** PROJECTED demand (computed live, never
stored): Customer SO · Inventory (stock below reorder point → the gap).
STORED demand (`purchase_demands`, v2 migration — only what a human types):
Warranty · Display · Office · Manual. Fields frozen: Source · Purchase Item ·
Supplier · Qty · Required By · Remark · Created By/At · Cancelled At/Reason.
**NO status column** (derived: open/ordered/done from PO links; only
cancellation is stored) · **NO partial qty** (one row = one issue; upgrade
later if the business ever needs it) · **NO free-text items** — a
**Purchase Item master** (kind: inventory_sku|service|expense|office|
marketing, sku link, default supplier) so price/history/analytics share one
identity. The A4-paper-three-ways disease dies at the door.

**Purchase Engine (frozen).** Internal chain: customer preferred delivery −
arrival buffer − production working days × supplier/company calendars ×
holidays × PO days (optional) = **ORDER BY — the engine's ONE answer**. It
is never printed as a date; it is WHERE the row sits (the rail bucket). The
grid's one visible date stays Preferred Delivery. Banned concepts forever:
PO Run · Suggested Run · Required Date on the grid (`Required By` lives only
inside Create Purchase as the manual demand's input). Rules: R1 stock →
open-PO netting · R2 the date math · R3 dateless → Today · R4 missing
setting → blocked by name, never defaulted · R5 supplier×category grouping,
sofa one-PO-per-customer-order · R6 non-catalog items get no engine date
(Required By or Today) · R7 GOLDEN RULE — the engine suggests, never
holds/skips/locks. **PO days, precisely:** *PO Days adjusts the raw Order By
date to the latest allowed PO day ON OR BEFORE it. It never moves the date
later. If that date has passed, the demand appears as overdue inside Today.*
Settings-driven both ways (empty = order any day, today's behaviour; set =
snap) — switching modes is a Settings edit, zero code. Issue is NEVER
greyed because today is not a PO day.

**THE PO SCHEDULE (superseded the time buckets the same day):** the rail's
first block is a PURCHASE CALENDAR — one row per upcoming configured PO day,
ROLLING from today (a past Monday never shows), labels are WEEKDAY NAMES
only (never `Today`), heading `PO Schedule` to match Settings' PO Days
(picker stops at Friday — the office does not work Saturday; supplier work
weeks keep theirs). Snap rule, hers verbatim: *"Always snap to the nearest
earlier PO day. Never move later."* Protection rule: a passed PO day sits in
a red **Overdue** row ABOVE the calendar and the next run may never swallow
it. Empty PO-days config = the calendar collapses to the next WORKING day
(never a weekend). `Today/Tomorrow/This Week/Next Week/All` all retired.
Ordered receipts sit on the current run's row (placed today) — older ones
belong to Purchase Orders (14-day wire window). **A TBD order (no delivery
date) is NOT LISTED AT ALL** — ruled three times: the engine cannot schedule
it and pre-ticking a run with goods for an unconfirmed order is worse than
not listing it; the projection brings it back the day the date is confirmed
(chasing that is the Orders module's Call customer action).

**BOTH rail blocks are toggles and both CLEAR ALL THE WAY** — empty = that
dimension stops filtering (the implicit All); nothing is ever forced to stay
lit; no param still opens on the engine's first run. CATEGORY = All ·
Mattress · Bedframe · Sofa · **Pillow · Mattress Protector** (planned ahead
of the inventory pipeline; sources never become rail rows).

**Toolbar (FINAL of four rounds):** caption `16 selected` · button
`Issue 2 POs` (the trade's shorthand; singular `Issue 1 PO`; `Issue PO` only
as the 0-count disabled word) · quiet two-line `Updated / 4:21 PM` · 40%
pill search. **THE BATCH IS VIEW-SCOPED — Excel's iron law**: Issue acts on
the sheet in front of you; a tick hidden by any filter neither counts nor
issues, and waits remembered. Hovering the button names the split
(`Ohana · Bedframe — 1 PO …`) — why-N answered without a preview band.
Retired wordings, never to return: `28 SO selected · → 10 Purchase Orders` ·
`Issue Purchase Orders` · `Issue 10 Purchase Orders` · the stacked `2 PO`
caption line.

**The Work Queue rail:** time entries + CATEGORY (All · Mattress · Bedframe ·
Sofa; Accessory joins WHEN inventory demand exists — deferred with the rest
of the vetoed UI). Rows are Linear Sidebar faithful: ONE line, name left,
bare number right (the word survives as the row title); All and category
rows carry no number. Sources NEVER become rail rows.

**Excel workspace (as deployed):** SEVEN columns — ☑ · Customer Delivery
(was Preferred Delivery; the date is the customer's, so the column says so)
· SO No. · Customer (Jess's ruling overrides Loo's `noise`; names render
Proper Case, records keep what was typed) · Model · Qty · PO No. **One row =
one BUILD** (`2 items` is banned from Model; a line of 2 identical pieces
stays ONE row qty 2 — Qty stays: SAP/AutoCount grain, and Pillow ×200 would
be 200 absurd rows without it). Every column header-click sorts (3rd click
clears) and Excel-filters (quiet ▼, funnel while narrowing, word first);
**the PO column's empty cell reads `Yet to Order`** — work, not missing
data — and its filter lists `Yet to Order` + the real PO numbers (generic
`Ordered` retired; `(Blanks)` banned); Qty carries NO filter caret (a 1·2·3
checklist is not worth the button that pushed the word off its numbers).
Column widths are FIXED PIXELS with the LAST column `auto` — percentage
columns inflate on wide monitors (the Model↔Qty hole's real cause); the kit
DataTable accepts raw CSS widths for exactly this. Header select-all over
the visible sheet; search matches SO · model · customer · PO; sticky header
paints on the TH cells over a border-separate table (border-collapse +
sticky = Chrome's see-through header); grid is the ONLY scroll area
(page h-full, not flex-1, inside the app's overflow-auto wrapper); footer =
Orders' own closing line (`8 orders` = SOs shown) + a `Clear filters` chip
whenever a column filter narrows silently. Engine pre-ticks ONLY its own
plan (Overdue + the first run); future rows wait for a human tick; all
overrides are deltas. Reports are TOP flash bands (GitHub flash): green
success — dismissible, with PO numbers and Phase A's units slot · red
failure — stays with Retry, may not be waved off · amber unresolved. The
bottom bar is dead. PO No. links deep-open the document
(`/operation/procurement/<slug>?po=`).

**Ordered rows:** last 14 days of POs ride the wire (`ordered`), sit in
their bucket, PO No. deep-links to `/operation/procurement/<slug>?po=` which
opens that document. Real history belongs to Purchase Orders.

**VETOED until the demand model proves out (do NOT build):** Source column ·
Accessory rail row · Create Purchase morphing dialog. Built once and
REVERTED 2026-08-01 (`git revert 90b7b434`) — business architecture first,
UI second. The dialog still shows the old Reason list until then.

**References (copy the PATTERN, never the business):** Layout=Linear
Sidebar · Toolbar=2990 Delivery Planning · Table=GitHub Repository Files ·
Filter=Excel AutoFilter · Dialog=GitHub New Issue · Audit=GitHub Issue
Timeline · Comments=Linear. 2990 is a UI reference, NOT a business
reference. Review method: ① who is the master? ② copy accuracy 🟢🔴 —
fidelity scores + missing items, never taste. Development order: **prove →
freeze → doc → shell → reuse** — 03-page-patterns.md and WorkQueueShell are
written ONLY after Jess plays for days without wanting change.

**Unit IDs (Phase A, queued):** every PO line already mints per-unit
`incoming` stock rows with `id-xxx000000` codes at PO-open (0153/0154 —
running silently since May). Phase A puts them ON SCREEN: Check-in lists
units per line · PO PDF prints them · Print labels (human serial + QR;
machine id in the QR) · a scan box on Receiving. Check-in BY unit (scan =
receive) is Phase B (touches the hot receive RPC — its own card).


**Division of responsibility:** To Order DECIDES which customer orders become
purchase orders today. Purchase Orders MANAGES the documents once they exist
(preview · communication · audit · PDF · WhatsApp · revision · ready date —
ALL of it, there). The word `Proposal` left the UI.

**THE GOLDEN RULE:** *the planning engine owns the schedule; operators own
the Purchase Order; operators never choose the next purchasing run — they
change the business requirement and the engine recalculates.* Hold · Skip ·
Next Run · Delay · Postpone · Move-to-Monday are banned forever. The two
real exceptions (`Change Required Date` — never touches
`orders.delivery_date` — and `Cancel Purchase`) need stored state: future
card.

**The page (deployed, the final freeze):**

```
LEFT  = ACTION LAUNCHER (Linear density, 200px, ~30px rows, no heading):
        Today · Mattress · Bedframe · Sofa — live counts that FALL as POs
        are created; clicking filters the grid
        + Create Purchase — a REAL dialog from day one (below)
        the Issue pill — exists ONLY while something is selected:
        `3 SO selected · → 2 Purchase Orders · [+ Issue Purchase Orders]`
RIGHT = the GitHub-Projects grid (kit DataTable, 40px rows), SIX columns
        FROZEN: ☑ · Preferred Delivery · SO No. · Model · Qty · PO No.
        No Customer (noise), no Category (the launcher said it), and
        **ORDER BY NEVER REACHES THE SCREEN** — the operator sees the
        CUSTOMER's date only (`ToOrderRow.delivery`, new on the wire),
        red when past, overdue-first then soonest. PO No. rightmost =
        "did today's order happen": `—`, then the number, in place.
TOP   = the Orders page's own strip (breadcrumb `Purchasing › To Order` +
        the SHARED TopBarIcons) · tabs · NO H1 anywhere (test-pinned) ·
        pill-shaped search (kit SearchInput `pill` shape) above the grid.
```

**Issue — zero popups, zero toasts (his own flow, verbatim built):** pill →
`Creating…` → one POST per supplier×category (ARRANGEMENT only — no sku/qty/
price; destination = the engine's DEFAULT, per-PO confirmation lives on the
generated documents) → **rows update IN PLACE** (☑ gone, PO No. a clickable
link) → launcher counts drop → bottom bar (exists only while it has
something to say): `3 Purchase Orders Created · Continue in Purchase Orders
→`. A partial failure STAYS in the bar with `Retry` (retries only the
failed group) until it succeeds. Toast is banned for this action — the
grid, the launcher and the bar are the notification.

**`+ Create Purchase` (the manual entrance — may NEVER be missing):** opens
a dialog — Reason ▾ (Ready Stock · Display · Warranty · Spare Parts ·
Office · Other…) · Supplier ▾ · Item 🔍 · Qty · Remark. **Category is never
asked** (it comes from the Item Master). Reason is part of the FORM, never
navigation — the launcher never grows a row per source. v1: `Create` is
disabled and reads `Available in next update.`

**The v2 data ruling (Loo, named it himself): `purchase_demands`** — ONE
unified demand table. Customer Orders flow in, Create Purchase flows in,
ONE engine eats it, no second pipeline ever. Manual demand with no
`Required By` goes straight into Today; with one, the engine plans it.

**Portal Grid Workspace standard (for Purchase Orders · Receiving · Claims ·
Payments):** Orders' own top strip · tabs carry no action/KPI/H1 · the grid
is the only scroll area · page actions appear only once BUILT (no dead
controls; `Create` in the dialog is the deliberate exception — it is
disabled AND says why) · no Refresh (the plan updates itself) · style DNA =
left Linear, right GitHub Projects (70/30).

## 0 · On screen now (deployed, PR #546)

`OperationToOrder.tsx`, one file, assembly only — exactly §0A. Blocked
demand (no production days) is currently NOT listed (the engine cannot
issue it); whether it needs a voice on this page again is a question for
Jess. Search lives above the grid (pill shape). The `Move ⋮⋮` column from an
earlier sketch is NOT in the frozen six — returns only if she asks.

## 1 · Business logic that must be kept

- `packages/shared/src/to-order.ts` — projection + **TO_ORDER_WORDS (the ONE
  word list)**; `ToOrderRow.delivery` = the customer's date (earliest
  deadline across the order's lines). Composers: `ordersHeadline` ·
  `soSelectedShort` · `posCreatedLine` · `purchaseOrderCount` ·
  `railItemLabel`/`sizeShort` · `countItems`.
- `to-order-preview.ts` — arrangement machine (+ `excluded`/`effectiveDocs`
  half, tested); the page currently uses `defaultDocuments` directly; the
  machine is v2 split's engine.
- The write contract, unchanged and not to be widened:
  `POST /api/operation/purchase/to-order/issue` `{supplierId, category,
  destinationId, purchaseOrders:[{key,include,buildKeys}]}` — the batch is N
  of these, sequential, negative-controlled to carry no sku/qty/cost/price.
- Kit: `SearchInput` `pill` shape (controlClass's third shape) · empty/
  loading states render through `Card`.

## 5 · Words owed to COPY-STANDARD (ruled by Loo 2026-08-01, on screen)

`Today` · `{n} Orders` · `Preferred Delivery` · `SO No.` · `Model` · `Qty` ·
`PO No.` · `Select` · `{n} SO selected` · `Issue Purchase Orders` ·
`Creating Purchase Orders…` · `{n} Purchase Orders Created` ·
`Continue in Purchase Orders` · `Retry` · `failed` · `Create Purchase` ·
`Reason` · `Ready Stock` · `Display` · `Warranty` · `Spare Parts` ·
`Office` · `Other…` · `Supplier` · `Item` · `Search item…` · `Remark` ·
`Cancel` · `Create` · `Available in next update.` · `Purchasing › To Order`.
Retired this day: the whole lens/views/group vocabulary · `Order today` ·
`Needs setup` · `cannot be planned` · `Ready to issue` · bucket words ·
`Planning & Audit` · `System generated from` · `Refresh` · `becomes N POs`.

## 9 · Rules that survive, and cost real money when broken

All prior entries stand (`.in()` SKU trap · surprising number = measurement
to check · negative control must fail · one fact one home · after a squash
cut fresh from main · date-fused fixtures die at month-end · fresh worktree
needs `.env.local`). New today:
- **`grep -c` returning 0 exits 1 and silently breaks a `&&` deploy chain** —
  the deploy commands after it never ran; caught because the deploy output
  was missing, not by luck.
- **The ratchet catches real drift**: a 12px icon, a page-drawn white box
  (→ kit `Card`), a duplicated ≥40-char class string — all forced back the
  same day.

## 12 · Columns and tables that do not exist

`purchase_demands` (v2 — THE unified demand store) · a purchasing
required-date override + cancel record (the two exceptions) · a destination
meaning "this PO's customer" (split/direct delivery) · `po_sends` ·
suppliers address/tel/attn/terms · an audit row from
`operation_create_pos_batch` (measured: none).

## 14 · Baselines (on the deployed tip `398f50d0`, 2026-08-01)

| | |
|---|---|
| shared | **2023/2023** |
| api | 3 pre-existing · `to-order.test.ts` 27/27 |
| web | 16 documented + 10 date-rollover (both pre-existing; fix chip spawned). Page suite **13/13** · preview 4/4 · kit 115. |
| tsc | web clean · api 4 pre-existing |
| design-standard | **8438** — the ratchet may never rise |

## 15 · Deployed

```
Main tip     398f50d0 (PR #546 — the final freeze; #544/#545 earlier today)
Web bundle   index-_7KYlTnP.js · 4,596,976 bytes · SERVICE_ROLE 0
             carres-portal 24137015 + carres-pos 569c9deb, --branch=main
             ALL 4 canonicals converged on the FIRST poll
             live bundle md5-identical to the local build (f7e2e768…)
API Worker   f203d77e — --env production (shared changed: delivery on the
             wire + the word overhaul); bindings echoed; /health 200
Migration    none
Bundle grep  vs live predecessor index-DrcPnNxZ.js (downloaded before the
             deploy replaced it). NEW: Preferred Delivery · Available in
             next update. · Issue Purchase Orders · to-order-issue-pill ·
             to-order-create-purchase · Continue in Purchase Orders ·
             SO No. · to-order-cat-today each 0→1 · PO No. 3→4.
             RETIRED: Order today · to-order-panel · to-order-batch-bar ·
             cannot be planned each 1→0.
```

**Session 2026-08-01 CLOSED with Jess's `deploy` order — the branch merged
and shipped (see §15). Final branch baselines: page 31/31 · kit 105 ·
shared 2034 · api to-order 33 · ratchet 8436 (fell twice: two legacy brand
aliases retired with the blue tab accent) · tsc 0. Two scanner traps met
again and dodged: `rounded-b-card` reads as `rounded-b` (frame the sheet in
a `rounded-card overflow-hidden` wrapper instead) and a dev server predating
new Tailwind tokens serves DEAD classes — restart before debugging
'transparent' anything.**

**Next for the NEW chat (Jess), in her order — she will amend more:**
1. Whatever she asks first — the page is hers to finish.
2. v2 `purchase_demands` (the dialog's real Save + engine intake + a
   migration, drafted per guardrail #8: tracker tail before numbering).
3. `Move ⋮⋮` / own-PO split + per-PO destination + the customer-address
   destination column (direct delivery's door).
4. Ordered Today / This Week queries (probably the Purchase Orders page).
5. `Change Required Date` / `Cancel Purchase` (storage + reasons).
6. Blocked demand's voice (`Needs setup` died with the views — does it need
   a new home?); the Orders-page migration onto the Portal Grid Workspace
   standard (LAST); rewrite `03-page-patterns.md`'s stale To Order example;
   COPY-STANDARD intake of §5's words.
