# BUILD QUEUE — the build chat reads THIS file, top unchecked item first.
> Do the top ☐ stage. Commit. Screenshot. STOP.
> Never ask the owner for scope. Scope questions go to the architect chat.
> Owner's only word: "next" / "approved" / pointing at a cell.

## STATUS — 2026-08-09
**STAGE 1 CLOSED ☑ `182d1cae`.** Register + read-only workspace accepted;
server search restored and guarded by a regression test; `Current` filed under
DOCUMENT; the live PDF chain proven on a real order (SO-1303, left and right
matching field by field).

**STAGE 2 CLOSED ☑ `2a6a5e9e`.** Verified corner-to-corner against 9 screenshots
at 1440 and 1130. What was proven on screen:
- `Sales Order │ Sales Orders` shell + `+ New Sales Order`, right rail intact,
  frozen register body untouched.
- CREATE: `/sales-orders/new` with a live DRAFT PDF on the right.
- VIEW: SO-1308 renders the Golden SO. All three copy decisions landed and are
  legible in the rendered bytes — SST line gone, no zero-padded numbers,
  T&C #1 reads "This sales order records your purchase agreement with Carres.
  The sales invoice is a separate document issued upon delivery."
- EDIT → SAVE mints a revision: `SO-1308 created · Rev 1` → `Saved · Rev 2`
  with history reading `Promised delivery: — → Fri, 28 Aug 26` and
  `B1201S (King): ×1 → ×2` → `Saved · Rev 3`.
- HISTORICAL revision is read-only: Rev 1 selected → header shows
  `Back to current`, no Edit, left pane restored to Floor 1 / No date yet /
  ×1 / RM 2,499, and the right PDF re-renders that snapshot, not today's row.
  This is the whole point of Stage 2 and it is proven, not asserted.
- DB floor, not UI politeness: `0327` puts the immutability trigger and the
  role gate in the database (`sales_order_revisions_no_rewrite`,
  `Operation/Principal only` 42501), so a revision cannot be rewritten by any
  client that reaches Postgres.

**STAGE 3 BUSINESS GATES ARE FROZEN — owner 我同意, 2026-08-09.** All seven gates
locked in `docs/STAGE-3-GATES.md`. **READ THAT FILE FIRST; it is the spec.**

**STAGE 3 IN FLIGHT — 3.1 ☑ · 3.2 ☑ · 3.3 BLOCKED BY AN ENVIRONMENT GATE.**
See `docs/HANDOVER-STAGE3.md` — a new chat starts THERE, not here.

**3.0 PRE-FLIGHT REPORTED.** Findings accepted. But the merge reverted Stage 2's
owner-ordered T&C correction on main, and the GRANT query stopped one table short
of the one Stage 2's integrity rests on. **NEXT: 3.0-FIX and 3.0-EXTEND. 3.1 does
not open until both are closed.** Two things stay deliberately undecided (the
ACCEPT signing mechanism, the amendment's visual form) — cards 3.0–3.5 need
neither. **You may not build past 3.5.**

**TEST ORDERS SO-1307 / SO-1308 — KEEP.** Owner ruling: they are regression
fixtures. SO-1308 carries a real Rev 1/2/3 history chain. Nothing deletes them
until Stage 3 is fully verified.

## ⛔ DONE MEANS I RAN IT — the highest law on this card
*Owner ruling, 2026-08-10. This outranks every other definition of "done"
in this file. A card that is green and unrun is NOT done.*

```
GREEN CI IS THE FLOOR, NOT THE FINISH LINE.
You do not hand work over. You run it, you break it, you fix what
breaks, and THEN you hand it over.
```

**WHAT "I RAN IT" MEANS — per artefact, no exceptions**

```
A ROUTE       called against the real running server, real auth, real data.
              Paste the status code and the body. Not a test — the route.

A DB FUNCTION invoked for real, ONCE PER FUNCTION and once per branch
              (each status · each role · each floor). plpgsql resolves
              columns at RUN time, not at CREATE time — a function that was
              never called was never checked, and `create function` succeeding
              means nothing.

A SCREEN      opened in a browser at 1440 AND 1130. Clicked through every
              state the card names. Console read, not assumed.

A GUARD       proven to BITE: put the exact bug back, in the exact SHAPE that
              caused it, and watch the guard fail and NAME the thing. A guard
              that passes on a broken tree is worse than no guard — it sells
              confidence it has not earned.

A MIGRATION   applied, then the thing it enables exercised end to end.
```

**WHAT DOES NOT COUNT AS RUNNING IT**

```
✗ tsc / vitest / lint green            — three green lights let a 500 ship
✗ a test that MOCKS the thing under    — mocking `rpc` proves WHICH function
  test                                    was called and executes zero lines
                                          of it
✗ a component test instead of an       — render tests cannot see a broken
  opened page                             API base, a 500, or a frozen layout
✗ "it should work" / "the code is      — the two sentences that precede
  correct"                                every incident in this project
✗ a screenshot promised for later      — a stage without its evidence is not
                                          a stage
```

**WHEN RUNNING IT REVEALS A BUG — the part that matters most**

```
FIX IT IN THE SAME CARD. Do not report it. Do not defer it. Do not add it
to a list for the owner to read. Finding it and leaving it is not honesty,
it is handing the owner your job.

Report ONLY what you could not fix, and say exactly why you could not.
```

**THIS LAW EXISTS BECAUSE OF WHAT ACTUALLY HAPPENED HERE**

```
· 3.3 shipped a 500. tsc green, vitest green, design-standard green — and the
  function body had never executed once, because the test mocked `rpc`.
· A schema guard matched `v_req.<col>` while the line that actually threw was
  a bare `order by created_at`. The bug was put back and the guard did not
  bite. A guard that only catches the shape it was written for is a lie.
· 18 of 19 worktrees pointed `vite dev` at the PRODUCTION Worker. Every local
  save wrote real business data. Nobody saw it because nobody opened the page.
· A stage was reported complete with a URL and zero screenshots, on a dev
  server that lived inside a sandbox the owner could never reach.
```

## GOVERNANCE — DECIDE BY DEFAULT
```
RUNNING CODE                     → law. A conflict escalates.
DOC / OLD CARD WITHOUT CODE      → evidence. Judge it yourself, today.
                                   Do NOT manufacture an owner question.
LATER OWNER STATEMENT            → supersedes old text. Old ruling dead.
```
Before escalating anything, run and SHOW: (1) does the conflicting rule have
code here? (2) has the owner already answered it? (3) does COPY 2990 answer it?
Any yes → decide. Escalate only if all three fail AND the decision changes
money, permissions, or what the customer was promised.

## CLOSED BY STANDING RULING — do not reopen
- **▸ expand SHIPS.** 2990's register uses DataGrid's expandable API. SO-1's
  "the register never expands" came from a docs-only commit (ef3c0c22 changed
  one .md; no implementation in this repo).
- **Row click → the workspace route, not a panel.** MfgSalesOrdersList.tsx:768
  navigates to a full page; the owner ruled the same. SO-3's PANEL is superseded.
- **Test-3 approvers** (architecture decision from existing ownership evidence):
  Salesperson / Showroom → `hr OR principal` · Dealer → `principal` only.
  Basis: commission-rule ownership 0245:78-81, plus the organisation boundary;
  internal-role RLS gives no dealer_id write floor, so approval is the gate.
  FALSIFIER: one explicit later owner ruling changes this route.

## VERIFIED FACTS — use these, do not re-derive
```
2990 sources
  pages/MfgSalesOrdersList.tsx   1,669   register
  pages/SalesOrderDetail.tsx     3,699   workspace + edit (?edit=1, one Save)
  lib/sales-order-pdf.ts           728   PDF renderer
                                         :243 PdfAction 'preview'
                                         :248 renderViaIframe  ← point at the
                                         right pane instead of window.open
  components/DataGrid.tsx        1,551   engine (already copied to
                                         apps/web/src/components/register)

Carres data
  orders                    0001_init.sql:241-283
    paid 264 · signature_url 265 · terms_accepted 266
  acceptance gate           0008_proceed_order_rpc.sql:86-100
                            (signature AND terms AND delivery date)
  order_payments            0193_order_payments_ledger.sql:16
  order_change_requests     0231_add_order_lines.sql:27-45
                            payload jsonb · pending/approved/rejected/cancelled
                            requested_by/decided_by/decided_at · applied_at
  purchase_orders           0001:322  dl → orders.dl
                            dl_refs added 0017 — ONE PO may serve MANY orders
  po_receipts.received_qty  0001:360
  commission live read      0245_hr_commission.sql:140-148
  commission rule gate      0245:78-81  app_role() in ('hr','principal')
  orders RLS                0002_rls.sql:185-189 read · 195-200 update
                            no WITH CHECK; internal roles unconstrained
  Items label               orders.ts:344-364 — DETAIL handler only
                            :350 order_lines.sku has NO FK to product_skus

Migration numbering: 0326 exists on claude/sales-orders-register-engine-81443e
and is UNMERGED. A new migration must clear the MAX across ALL branches.
```

---

## ☑ STAGE 1 · REGISTER + READ-ONLY WORKSPACE — CLOSED `182d1cae`
**Nothing in this stage writes to the database.**

Build:
- Sales Orders register on the copied DataGrid.
- Default visible: `☐ ▸ SO No · Customer · Items · Total · Balance · Promised · Ordered · Dealer · Showroom`
- Everything else defaultHidden. Chooser GROUPED:
  `DOCUMENT · CUSTOMER · SOURCE · ITEMS · MONEY · DATES · DELIVERY · OPERATION`
- Role defaults: Operations (money hidden, openable) / Finance (money visible).
  **defaultHidden is NOT permission** — restricted facts are removed from the API
  response, never merely hidden in the grid.
- ▸ expand · double-click → workspace · right-click menu
  (Open · Edit · Print PDF · Copy SO No — nothing else).
- Export Excel = current view; with selection = selected rows only.
- Footer totals over the FILTERED list, not the visible window.
- Items resolver extracted to a SHARED helper; the list handler batches one
  `.in("sku", […])` per page. Detail and list use ONE implementation (Law D).
- `/operation/orders` swaps to this page by changing ONE identifier.
  `OperationOrdersControl` stays compiled and unrouted. Do not delete it.
- Workspace VIEW route: read-only, left facts + right embedded PDF from the
  copied renderer.

NEGATIVE CONTROLS — the build FAILS if any appear:
- ✗ any Actions column, workflow button, or composite Status cell
- ✗ Issue PO · Arrange Delivery · payment execution · PIC avatars
- ✗ a second grid engine — `components/register/DataGrid` only
- ✗ any saved-views / layout-manager UI
- ✗ any cell holding two operational facts
- ✗ any write path of any kind

DONE WHEN: screenshots at 1440 and 1130 · zero clipped cells · one row height ·
Excel export opens with the visible columns and filtered rows only · the PDF in
the right pane is the same renderer output as Print.

---

## STAGE 1 · REGISTER — FROZEN, ACCEPTED

Verified against real screenshots, not the build report. Do NOT redesign:

```
✓ it is 2990's Excel register          ✓ Columns grouped into 8 — better than 2990
✓ the 9 default columns are right      ✓ footer total follows the FILTERED set
✓ ▸ expand                             ✓ no Actions column, no workflow buttons
✓ Customer + muted phone               ✓ export / filter / resize / chooser skeleton
✓ Total / Balance comparable           ✓ Promised / Ordered independent
✓ Dealer / Showroom have their place
```

## STAGE 1 · FIX-LIST BEFORE PASS

```
Do ONLY these three fixes.
Do not redesign the register.
Do not change the Sales Order PDF template.
Do not start Stage 2.

FIX 1 — RESTORE SERVER SEARCH [BLOCKER]

The Stage 1 branch was opened from main and regressed the already-fixed
server search.

  SalesOrdersRegister.tsx:253 │ useOperationOrders({})
  orders.ts:250               │ .limit(200)

Required:
- SalesOrdersRegister passes the debounced search term to
  useOperationOrders().
- DataGrid exposes onSearchChange and emits the debounced trimmed value.
- orders API performs server-side search.
- Remove the 200-row trap; current agreed cap = 500.

Acceptance:
- Prove search is sent to the API, not only filtering the rows already
  loaded in the browser.
- Add/retain a test that would fail if the register returned to
  client-only search.
- Do not change the grid engine for this fix.


FIX 2 — MOVE CURRENT TO DOCUMENT

Current is a document/lifecycle pointer.

Change only:

  current
    group: "Operation"
         ↓
    group: "Document"

Expected DOCUMENT group:

  SO No
  Customer reference
  Current
  DO No
  Invoice No

Do not change currentOf() semantics.
Never fabricate a downstream document number.


FIX 3 — PROVE LIVE PDF INTEGRATION [BLOCKER]

The attached SO-1256 PDF is a separately designed TEMPLATE SAMPLE
supplied by the owner. It is NOT evidence that the workspace is
rendering live SO-1256 data — its customer, items and totals do not
match the real SO-1256 in the register.

Do not modify that template as part of this fix.

Use one REAL order from the current database, e.g. SO-1303.

Open:

  Sales Orders
      → SO-1303
      → Workspace

Required proof in a REAL browser:

  LEFT                           RIGHT
  ─────────────────────────────────────────
  SO-1303                       SO-1303 PDF
  same customer                 same customer
  same items                    same items
  same total                    same total
  same dates                    same dates

The embedded preview must visibly render in the right pane.

Print PDF must use the SAME rendered document/blob as the preview.
No second PDF implementation.

If browser screenshot tooling cannot capture the iframe/plugin:
do NOT substitute an unrelated sample PDF and call it proof.
Use another browser-renderable preview mechanism for acceptance evidence
(e.g. render the same PDF blob to the pane) while keeping Print PDF on
the same renderer/source.


STOP CONDITION

After all three:

1. run focused tests
2. run existing gates
3. provide raw evidence for server search
4. provide Columns screenshot showing Current under DOCUMENT
5. provide real-order workspace screenshot with matching left/right data
6. commit
7. STOP

Do not start Stage 2.
Do not merge/deploy.
```

> Layout (55% / 45%) is **Stage 2 architecture**, deliberately NOT part of
> this fix. Stage 1's only remaining job is to prove the chain
> `live order → same PDF renderer → embedded preview` is real.

## ☑ STAGE 2 · EDIT / CREATE + REVISION ENGINE — CLOSED `2a6a5e9e`
Every write mints a revision. No approval logic yet — in this stage every change
behaves as Class B with no approval.

**THE MODULE SHELL — Register and Workspace share it**

```
┌─────────────────────────────────────────────────────────────────┬────┐
│ 🛍 Sales Order │ [Sales Orders]              Updated 9:26  🔔 ⚙ │ 👥 │
│                  ▔▔▔▔▔▔▔▔▔▔▔▔                                    │ 📅 │
│   module word │ divider │ tab row, h-44 — the Purchasing pattern │ 🚩 │
├─────────────────────────────────────────────────────────────────┤ 📝 │
│                     page body                                    │    │
└─────────────────────────────────────────────────────────────────┴────┘
                                                          right rail 52px
                                                  Team · Calendar ·
                                                  Follow-ups · Activity
```

Verified against the real 2990 screen — its own breadcrumb reads
`Home > Sales Order > Sales Orders`, and SALES ORDER is the module /
document-family name. So the module word is **`Sales Order`** (singular).
Do NOT shorten it to "Sales".

```
TAB ROW
  today      [Sales Orders]
  Stage 3    [Sales Orders] [Amendments]
```

**Do NOT pre-create** Delivery Orders / Sales Invoices / Delivery Returns
tabs. 2990 groups them under its SALES ORDER family; Carres already has
Delivery and Payments module ownership. Whether Carres becomes
document-family navigation or keeps module ownership is NOT frozen — decide
it when the matching document lifecycle is actually built.

Also decided:
- Right rail RESTORED on Register AND Workspace, same as every other
  operation page. (This supersedes SO-1's "rail not mounted" ruling —
  later owner statement wins.)
- Workspace uses the SAME module header; `Print PDF` / `Back to register`
  sit in the header-right meta slot.
- **NO KPI cards.** 2990 shows Total Orders / Revenue / Outstanding / Paid;
  Carres does not. Register Law 6 — aggregates belong to the Dashboard, and
  the filtered footer already carries Total / Balance.
- Left navigation stays **"Sales Orders"**. Only the in-page module word is
  "Sales Order".
- The frozen register body is untouched. The PDF template is untouched
  except the three copy decisions above.

**THE WORKSPACE SKELETON — one layout, three modes, no fourth:**

```
┌────────────────────── 55% ─────────────────────┬──── 45% ────┐
│ CUSTOMER                                       │              │
│ SOURCE                                         │              │
│ DATES                                          │     PDF      │
│ DELIVERY                                       │   PREVIEW    │
│ ITEMS                                          │              │
│ MONEY                                          │              │
│ HISTORY / REVISION                             │              │
└────────────────────────────────────────────────┴──────────────┘

VIEW     values
EDIT     the same slots become editable + live draft preview
CREATE   the same form, unlocked
OLD REV  the same workspace, read-only + the historical PDF
```

Stage 1's workspace is ~34% / 66% with summary cards. That was a read-only
placeholder. Do NOT carry it forward — the left side must hold the seven
sections above, or Stage 3 will have to split it a second time.

Build:
- Same workspace; `?edit=1` toggles fields; ONE page-level Save.
- `/sales-orders/new` — SAME form components, SAME renderer.
- `[+ New Sales Order]` visible to authorised roles only. Normal orders are still
  born in the Sales Portal.
- Embedded PDF updates LIVE from draft state, 300ms debounce, no Save required.
  Revoke the previous blob URL on each render.
- Revision store: immutable snapshot per revision (header + lines), unique
  (order, revision), **Rev 1 = original**.
- Revision selector. Selecting an old revision makes the workspace READ-ONLY,
  restores that revision's state, and renders the PDF FROM THAT SNAPSHOT —
  printable.
- Human-readable change history: `+ added` · `− removed` · `old → new`.

NEGATIVE CONTROLS:
- ✗ never mutate or delete an existing revision
- ✗ never derive "original" from the current row — Rev 1 is the source
- ✗ no approval UI in this stage
- ✗ no downstream module is written to, at all
- ✗ do not alter 0326; write a NEW migration clearing the all-branch MAX

DONE WHEN: edit → Save → Rev N+1 · select Rev 1 → the old PDF prints · viewing
history leaves the current row unchanged · a second edit produces Rev N+2 with
both older revisions still reproducible.

---

# STAGE 3 — SEVEN CARDS, RUN IN ORDER. NOT ONE CARD.

## ▶ HOW STAGE 3 RUNS — CHANGED 2026-08-10, THIS SUPERSEDES "STOP AFTER EACH CARD"
The owner is not a queue. Stopping after every card cost seven round trips to buy
one real catch. New rule for 3.1 → 3.5:

```
RUN 3.1 → 3.2 → 3.3 → 3.4 → 3.5 CONTINUOUSLY. Do not stop between them.
Commit each card separately. Collect each card's evidence as you go.
Report ONCE, at the wall after 3.5.
```

**STOP EARLY only for these, and say which one:**
```
1. A card's DONE-WHEN cannot be met without inventing something the GATES
   file does not decide.
2. Two pieces of RUNNING CODE conflict — governance says that escalates.
3. A negative control fails and the fix would change a frozen gate.
4. You are about to touch ACCEPT's signing form or the amendment's visual
   form. Those are the wall. Never cross it.
5. AN ENVIRONMENT GATE — a tool-layer permission refusal (e.g. the Supabase
   `apply_migration` classifier). NOT a spec failure. Name it as an environment
   gate, say exactly what is blocked and what unlocks it, and NEVER work around
   it. Added 2026-08-10 after 3.3 hit exactly this.
```
Anything else — decide it, log the decision in the report, keep going.

**BEFORE EACH CARD, RUN THE REGRESSION SWEEP.** Twice now an accepted decision has
silently reverted (the server-search fix; the T&C sentence). At the start of every
card, re-assert on the branch you are on:
```
grep the accepted T&C sentence in the SO template          → must be present
grep -i "tax invoice" in the SO template                   → must be ZERO
register search must still hit the server (the Stage 1 regression test)
SO-1308 Rev 1 must still replay its own snapshot
```
If any fails, FIX IT IN THAT CARD and say so. Do not carry it forward and do not
come back to ask.

**`docs/STAGE-3-GATES.md` is now FROZEN LAW (owner: 我同意, 2026-08-09). READ IT
FIRST — it is the spec. You may not decide anything it decides differently.**

Do the top ☐ card. Commit. Evidence. STOP. Do not merge two cards.

## THE SEVEN VERBS — never two on one button
```
SAVE        Direct correction → write order + mint Revision     (Stage 2, DONE)
SUBMIT      Create a contractual amendment request
APPROVE     Internal approval only, WHEN REQUIRED
ISSUE       Freeze the proposed amendment document
ACCEPT      The customer accepts THAT EXACT amendment document
APPLY       Make the accepted amendment the current SO revision
DOWNSTREAM  Raise durable correction work; never rewrite a downstream fact

Internal approval required?  ≠  Customer acceptance required?
Class A: acceptance ALWAYS · approval SOMETIMES
Class B: acceptance NEVER  · approval SOMETIMES (Test 3)
```

## ⛔ THE OWNER WALL — you may not build past card 3.5
Two things are NOT decided and you may NOT invent them:
```
1. The ACCEPT mechanism (signing form) — deferred to legal counsel.
2. The amendment document's visual form — a separate design conversation.
```
Cards 3.0–3.5 are fully specified and need neither. Build them. When 3.5 is
closed, STOP and say so. Do not design a signature flow. Do not design an
amendment PDF. Inventing either is the single worst failure available in this
stage.

## EVIDENCE RULE FOR THIS STAGE
Cards 3.0–3.2 have no UI. For them the evidence is **pasted SQL / test output**,
not screenshots. From 3.3 onward the normal law applies: running URL + 1440 and
1130 screenshots. A card without its evidence form is NOT done.

---

## ☐ 3.0 · PRE-FLIGHT — three blockers, no feature
Nothing in Stage 3 may be built before these three are closed and reported.
```
① MERGE 0326 + 0327 into main. They are applied to the shared Supabase but not
  merged. Everything below assumes the Stage 2 revision engine is on main.

② COLUMN-LEVEL GRANTS — inspect and paste the result:
  which roles hold UPDATE on public.orders / order_lines / order_addons, column
  level included. IF a role can UPDATE orders directly through PostgREST, say so
  loudly — the APPLY-only RPC in 3.3 and 3.8 is theatre without a revoke, and
  card 3.3 changes shape. This is a FINDING card, not a fix card. Report, stop.

③ ITEMS FILL RATE — count orders with zero order_lines, split by status.
  Line-level classification is undefined on orders with no lines. Paste the
  numbers. If the rate is material, say so; do not silently proceed.
```
DONE WHEN: 0326/0327 on main + two query outputs pasted + an explicit sentence
saying whether ② changes card 3.3.

---

## ☑ 3.0 · PRE-FLIGHT — REPORTED, ACCEPTED (findings only)
```
① 0326/0327 merged on stage3-preflight-merge (e8c80d22), fast-forward to main.
   amount-in-words retirement VERIFIED BY ARCHITECT, not taken on trust:
   7cafd6a8 / ea5b9c40 (#706) carry "Owner rounds (Loo, 2026-08-09): Amount-in-
   words REMOVED everywhere (SO template + law §7)", and SO-PDF-STANDARD.md's
   changelog records "Round 31 … REMOVED family-wide | Loo".
   后令胜前令 applied CORRECTLY. Stage 2's amount-in-words is dead. No dispute.
② GRANTS — anon + authenticated hold table-level UPDATE/INSERT/DELETE on
   orders/order_lines/order_addons; 332 column grants, no narrowing. RLS lets
   operation·finance·bd·principal through. THE APPLY-ONLY RPC IS THEATRE TODAY.
   Card 3.3 confirmed to change shape: it must carry a GRANT-narrowing migration
   plus an inventory of existing direct-write call sites.
③ 80 orders, 0 with zero lines. GATE 1 unblocked.
```

## ☑ 3.0-FIX · CLOSED `87f990f4` — T&C restored, wording written into law, bytes re-proven
Evidence accepted: `pdftotext` on the live Print blob returns the accepted sentence
and `grep -i "tax invoice"` returns ZERO hits. Byte-level, not a screenshot claim.
SO-PDF-STANDARD.md §7.1 now holds the WORDING as law with the owner date, so a
future template rewrite cannot out-vote it. This was the one gate worth its cost.

## ☑ 3.0-EXTEND · CLOSED — forged revisions are impossible today
`sales_order_revisions` and `order_change_requests` each carry ONE SELECT policy
and NO write policy. PostgreSQL denies a command with no policy — the GRANT is a
door number with no door. Proven, not read: a principal JWT INSERT through
PostgREST was refused on both with "new row violates row-level security policy".
```
0327's trigger   guards REWRITING an existing revision
RLS (no policy)  guards FORGING a new one
```
Recorded, not work: TRUNCATE is granted and is not RLS-constrained, but PostgREST
does not expose it and no client holds a direct SQL connection — unreachable today.

## HISTORICAL — the gate text that closed above

**Found by the architect reading `origin/main`, not reported by the build.**

The merge chose the document-family SO template. That template never received
Stage 2's owner-ordered T&C correction, so main has reverted to the sentence the
owner rejected on 2026-08-09.

```
2a6a5e9e:apps/web/src/lib/pdf/sales-order-template.tsx:599   ← ACCEPTED by owner
  1. This sales order records your purchase agreement with Carres.
     The sales invoice is a separate document issued upon delivery.

ea5b9c40:apps/web/src/lib/pdf/sales-order-template.tsx:710   ← ON MAIN NOW
  1. This sales order becomes a binding tax invoice once goods are
     delivered and full payment is reconciled.
```

This is not a style preference. The restored sentence contradicts the family's
OWN law, in the same file:
```
ea5b9c40:…/sales-order-template.tsx:17-18
  "The SO does not talk tax: no Tax row, no 'incl. SST' claim …
   The invoice owns SST."
```
and #706 built a SEPARATE Invoice document. A Sales Order that "becomes a binding
tax invoice" is false under the family architecture the same commit shipped.

**Why it survived:** `SO-PDF-STANDARD.md` records geometry, §7, and 31 owner
rounds — but it never records the T&C WORDING. Nothing in the standard defended
the corrected sentence, so the family template silently kept the old one.

REQUIRED, in one small commit on top of the merge:
```
1. Restore T&C #1 to the accepted wording in the family template.
2. Add the T&C WORDING to SO-PDF-STANDARD.md as law, with the owner date, so a
   fourth template rewrite cannot revert it again.
3. Re-render SO-1308 Rev 1 / Rev 2 / Rev 3 on the merged branch and paste the
   1440 screenshots. Stage 2's PASS was against BYTES; the bytes changed.
   Confirm on screen: T&C #1 correct · no SST row · no zero-padded numbers ·
   Rev 1 historical replay still matches its snapshot.
```

## ⛔ 3.0-EXTEND · THE GRANT QUERY STOPPED ONE TABLE SHORT
② covered `orders · order_lines · order_addons`. It did NOT cover the table
Stage 2's whole integrity claim rests on.

```
0327's trigger blocks REWRITING an existing revision.
It does not block INSERTING a fabricated one.
```
If `authenticated` holds INSERT on `public.sales_order_revisions`, then the
immutable revision ledger — the thing the owner accepted Stage 2 for — can be
forged through PostgREST today, and 3.1 would be built on a floor that is not
there.

RUN AND PASTE, before 3.1:
```
table_privileges + column_privileges + RLS policies for:
  public.sales_order_revisions
  public.order_change_requests
State plainly whether a non-definer INSERT is possible on either.
```

## RECORDED FROM 3.0 — carries into 3.2 / 3.3 verification
③'s number is right; its conclusion "无实质缺口" is one step too far.
```
80 orders · 0 delivered · 0 cancelled.
```
GATE 7 governs delivered and cancelled. **No row in the database has ever
reached either state.** GATE 1 is genuinely unblocked, but 3.2's floors
(invoices · po_receipts · logistics dispatched · GATE 7 finality) cannot be
verified against live data. 3.2 and 3.3 must ship CONSTRUCTED FIXTURES for
those states, planned at card start, not discovered at demo time.
Also confirm the count ran against the Carres project, not a scratch one.

## ☐ 3.1 · CLASSIFICATION REGISTRY — two allowlists, no residue
GATES.md GATE 1 is the spec. Copy the two lists from it verbatim.
```
A       = explicit allowlist
B       = explicit allowlist
UNKNOWN = BLOCK
```
Build:
- one module exporting `CLASS_A_FIELDS` and `CLASS_B_FIELDS`,
- `classify(changedFields) → { class: 'A'|'B', fields, requiresTest3, unknown[] }`,
- **a BUILD-TIME exhaustiveness test**: enumerate every writable column of
  `orders` · `order_lines` · `order_addons` from `information_schema` and FAIL
  the test if any column appears in neither list.

The guard is at build time on purpose. Operators never meet it; only the engineer
who adds an unclassified column does, and they meet it before merge.

NEGATIVE CONTROLS:
- ✗ no "everything else is B" fallback, anywhere, in any form.
- ✗ classification never runs off a field's NAME by analogy. Lists only.
- ✗ this card changes NO behaviour. Nothing calls `classify` yet.

DONE WHEN: the test passes; then delete one entry from `CLASS_B_FIELDS`, show the
test FAILING and naming that column, restore it. Paste both runs.

---

## ☐ 3.2 · CONSEQUENCE FLOOR EVALUATOR — read-only, blocks nothing
GATES.md GATE 6 table is the spec, row by row. Reuse existing code; do NOT write
a second engine for anything already implemented.
```
evaluate(order_id, changedFields) → Finding[]
  { field, consequence, state, severity: 'BLOCK'|'WORK'|'NONE', shared?: bool,
    evidence }
```
Floors, each keyed to the CHANGED FIELD, never to the whole order:
```
purchase_orders on this DL (dl_refs 0017)   → WORK. shared=true when dl_refs
                                              holds >1 order. NEVER auto-revise.
po_receipts.received_qty                    → BLOCK when new qty < received.
                                              2990 ReceivedFloorError shape,
                                              PRE-mutation.
operation_stage in ('in_production',…)      → applies ONLY to order_lines /
                                              addons / delivery_date.
logistics_stage / partner_stage dispatched+ → delivery correction WORK.
invoices with voided_at null                → BLOCK money changes. Route: credit
                                              note / refunds (0001:424).
commission month lock                       → call 0272
                                              `_commission_assert_order_month_open`.
                                              Do not write a second one.
status delivered | cancelled (GATE 7)       → BLOCK all contractual fields;
                                              contact corrections still allowed;
                                              revisions always appendable.
```
NEGATIVE CONTROLS:
- ✗ `operation_stage` is NOT a global blocker. Changing a phone number is never
  blocked by it. A per-order refusal here is a card failure.
- ✗ this card WRITES NOTHING and BLOCKS NOTHING. It returns findings.

DONE WHEN: run it against SO-1308 and against at least two real historical orders
that have a live PO and a receipt. Paste the Finding[] output for each.

---

## ☐ 3.3 · CLASS B + TEST 3 — the full SUBMIT → APPROVE → APPLY rehearsal
The safe half of the machine. **No ACCEPT anywhere in this card** — Class B never
touches the customer's agreement. This is the rehearsal that proves the verbs are
separate before contract law arrives.

Scope: `salesperson_id · dealer_id · outlet_id · channel` only.
(Class B WITHOUT Test 3 is already Stage 2's SAVE. Build nothing for it.)
```
SUBMIT   → order_change_requests, NEW kind (extend the check constraint).
           One live request per order — the unique index at 0231 already does it.
APPROVE  → status = 'approved'. WRITES NOTHING ELSE. Not the order. Not anything.
APPLY    → separate RPC. for update lock → re-run 3.2 floors → write via an
           EXPLICIT COLUMN ALLOWLIST → mint revision → stamp applied_at.
           Second call is a no-op.
```
Approvers, per GATES.md GATE 3 (frozen):
```
Salesperson / Showroom → hr OR principal      Dealer → principal ONLY
```
**Server-side RPC, not UI.** Internal roles have no dealer_id write floor in RLS
(0002_rls.sql:195-200 constrains dealers only), so a UI gate is not a control for
the exact roles that can bypass it.

NEGATIVE CONTROLS:
- ✗ APPROVE must not write the order. Prove it: approve, then show the order row
  and its revision count UNCHANGED. Then APPLY.
- ✗ a rejected request changes no business state.
- ✗ no `update orders set …` from a payload. Allowlist only — logistics and
  invoicing live on the same row (GATES.md GATE 5 trap).
- ✗ commission month locked → the 0272 message must surface to the user, not a
  generic error.

DONE WHEN: URL + 1440/1130. Screens: pending request · approve (order unchanged) ·
apply (revision minted) · apply again (no-op) · a locked-month attempt showing
0272's own message.

---

## ☐ 3.4 · DOWNSTREAM — durable work, owned by the receiving module
Consumes 3.2's findings. Independent of ACCEPT — build it while the owner decides.
```
DOWNSTREAM = PERSISTED correction work with a state and an owner, that survives
             until someone closes it.
NOT a toast. NOT an email. NOT a fire-and-forget event.
NOT an automatic rewrite of the other module's fact.
```
Each `severity: 'WORK'` finding becomes a row the owning module sees in its own
surface, carrying: order_id · revision · fields_changed · classification ·
potentially_affected · shared · state · owner · closed_by · closed_at.

NEGATIVE CONTROLS:
- ✗ NEVER writes purchase_orders, po_receipts, invoices, payments, or a delivery
  record. `LINEAGE IS NOT PERMISSION.`
- ✗ NO automatic PO re-derivation. NO `purchase_orders.order_line_id`. See
  **PO LINEAGE** below — one FK column is a LIE under consolidation.
- ✗ a downstream module's snapshot is never rewritten by an upstream change
  (Guarantee 0262 / Service 0210 already work this way).
- ✗ work must not be closable by the module that raised it.

DONE WHEN: apply a 3.3 attribution change on an order with a live shared PO;
show the raised work row still present after a full page reload and a re-login.
Permanence is the whole point — prove it survives, don't assert it.

---

## ☐ 3.5 · AMENDMENT RECORD + SUBMIT + base_contractual_hash — NO ISSUE
The spine, built without the two undecided things.
```
amendment
  order_id
  base_revision            the SO revision this was computed FROM
  base_contractual_hash    hash over the CLASS A FIELDS ONLY (3.1's list)
  proposed_snapshot        what the SO becomes if accepted
  status                   draft → submitted → (issued → accepted → applied)
  applied_at
```
`base_contractual_hash` is the concurrency guard the owner confirmed. Computed
over Class A fields ONLY, which is why a Class B correction landing while an
amendment waits does NOT invalidate it:
```
window: B correction lands  → hash unchanged → amendment still valid
window: another A lands     → hash changed   → amendment STALE
```
NEGATIVE CONTROLS:
- ✗ an open amendment must NOT lock phone / address / notes. If SUBMIT freezes
  the whole Sales Order, the card has failed — `LOCK THE CONSEQUENCE`.
- ✗ do NOT build ISSUE. Do NOT build ACCEPT. Do NOT build Class-A APPLY.
- ✗ Class-A APPLY must exist ONLY as a hard refusal:
  `raise 'Class A amendment cannot be applied — ACCEPT is not built yet'`.
  That refusal IS the deliverable. It proves the boundary holds.

DONE WHEN: URL + 1440/1130. Submit an amendment on SO-1308; change a phone number
while it is open and show it SAVES and the amendment is still valid; change a qty
and show the amendment marked STALE; attempt Class-A APPLY and show the refusal.

---

## ⛔ STOP HERE. REPORT. DO NOT CONTINUE.

## ☐ 3.6 · ISSUE — BLOCKED ON OWNER
Needs: the amendment document's visual form. Not decided. Do not invent it.
Note when it opens: `document_hash` is the hash of the ISSUED BYTES, because
`PDF bytes = single source of truth`.

## ☐ 3.7 · ACCEPT — BLOCKED ON OWNER
Needs: the signing mechanism, deferred to legal counsel. Do not invent it.
Product shape is frozen: acceptance binds to the EXACT document identity.

## ☐ 3.8 · CLASS-A APPLY — depends on 3.6 + 3.7
The two comparisons, both required, neither sufficient:
```
accepted_document_hash == document_hash
      proves: the customer accepted THIS document.
current_contractual_hash == base_contractual_hash
      proves: the contractual starting point that document was built on still
              holds at APPLY time.
```
Then: rerun 3.2 floors → write via allowlist → mint revision → stamp applied_at.
Any floor fails → APPLY FAILS WHOLE. Never partially applies.

## PO LINEAGE — LOCKED, DO NOT SIMPLIFY

Carres consolidates. One PO line can serve several customer orders:

```
PO-2608-011  Jager King ×4
   ├── SO-1301 line 7  ×1
   ├── SO-1288 line 3  ×1
   └── SO-1295 line 5  ×2
```

`purchase_orders.order_line_id` is **FORBIDDEN**. One FK points at one line;
those four units do not belong to one line. The column would be false the day
it shipped.

VERIFIED: `purchase_demands` (0319) does NOT cover this — its `purpose` is
`ready_stock | display | office | warranty`, non-customer demand only.
Customer-order allocation lineage does not exist in Carres today.
Its partial-satisfaction shape IS worth copying: `qty` / `issued_qty` /
`remaining_qty` (0320).

**V1 IMPACT DETECTION — Stage 3, no new table**

Use existing `dl` / `dl_refs` + SKU ONLY to identify **POTENTIALLY AFFECTED**
purchase commitments.

- It is **not** an allocation truth.
- It must **never** be used to auto-adjust PO quantity.
- If one PO / SKU serves multiple Sales Orders, show EVERY related SO and
  mark the impact **SHARED**. Human resolution required.

```
find purchase_orders where (dl = this order OR dl_refs contains it)
                      AND sku = the old sku
  → POTENTIALLY AFFECTED (not "the" PO line)
  → shown BEFORE approval, every other order it serves named
  → SHARED impact flagged
  → approve → raise Purchasing correction work
  → the PO row is not touched
```

**TARGET LINEAGE — later, not this card**

```
sales order line / customer demand
        ↓
     allocation
        ↓
purchase order line

allocation stores:
  source demand identity
  PO line identity
  allocated qty
  remaining / released qty if needed

One SO line may be supplied by multiple PO lines.
One PO line may supply multiple SO lines.
```

Borrow the PARTIAL-SATISFACTION IDEA from `purchase_demands`
(`qty` / `issued_qty` / `remaining_qty`, 0320) — do NOT reuse that table.
Customer-order demand and ready-stock demand are two business sources; they
may share the allocation PATTERN, not the same entity.

> **LINEAGE IS NOT PERMISSION.**
> A Sales Amendment changes the customer agreement. It IDENTIFIES downstream
> consequences; it NEVER silently rewrites an already-issued purchasing fact.

## proceed_date — WHAT IT IS AND IS NOT

Carres already has 2990's processing-date concept **and** a lock:
```
0165_add_proceed_date.sql:19      'salesperson-entered planned
                                   production-start date … <= delivery_date'
0222_pos_proceed_lane_edits.sql:239-241
                                   proceed_date < today(MYT)
                                   → raise 'The proceed date has passed'
```

**USE IT AS:** the DIRECT-EDIT boundary. After the proceed date a field that
was directly editable in the proceed lane stops being directly editable.

**DO NOT USE IT AS:** an amendment trigger or an amendment blocker. A date
passing is not proof that a downstream commitment exists. Test 2 still asks
the real questions: PO issued? goods received? delivery accepted? delivered?
payment taken?

```
OLD MODEL   lock → you may not change it
THIS MODEL  lock → you may not change it DIRECTLY;
                   a contractual change goes to Amendment
```

## STRUCTURED ADDRESS — IT EXISTS

```
0230_orders_structured_address.sql:31-35
  customer_address_line1 · customer_address_line2 ·
  customer_address_state · customer_address_city · customer_address_postcode
```
Plus Building Type, captured by the Sales Portal.

CUSTOMER group ships: Name · Phone · Email · Address (raw fallback) ·
Address Line 1 · Address Line 2 · City · State · Postcode · Building Type.
New POS orders fill the structured fields; legacy / imported orders show `—`
and keep raw `customer_address` as the fallback.

## Current — SHIPS, AS A DERIVED LIFECYCLE POINTER

Not "2990 has delivery_orders so Carres cannot". The business meaning is:
**which formal document or stage has this order reached?**

```
V1, from what exists today:
  invoice_no ?? do_number ?? the live stage
  (PO issued · GRN received · Ready for delivery · Delivered)
Never invent a document number that does not exist.
```
As the shared PO / DO / GRN document templates land, Current starts printing
real document numbers with no rewrite.

## SALES ORDER PDF — GOLDEN BASELINE, SUPERSEDED

```
IMPORTANT — SALES ORDER PDF BASELINE SUPERSEDED

Use the latest owner-supplied CARRES-SO.pdf as the ONLY Sales Order
design/content baseline.

Do NOT use the current localhost SO-1303 renderer screenshot as the
template baseline.
Do NOT redesign the PDF.

The latest final already resolves:
  ✓ canonical SO number format — SO-1256 everywhere
    (header · ORDER DETAILS · footer, no zero-padding, no second format)
  ✓ no "TOTAL (INCL. SST 8%)" — the totals block is
      Subtotal · Paid to date · BALANCE DUE
  ✓ final document hierarchy / spacing / payment table / signature /
    balance / footer
  ✓ category bands (SOFA · MATTRESS · SERVICE), Discount column,
    Amount in words, Emergency contact, Access (floor · lift),
    Proceed date, Salesperson

ONLY OUTSTANDING COPY CORRECTION:

  T&C #1 must NOT say the Sales Order becomes a tax invoice.

  ✗ "This sales order becomes a binding tax invoice once goods are
     delivered and full payment is reconciled."

  Sales Order and Sales Invoice are SEPARATE lifecycle documents:
     Sales Order      customer agreement
     Delivery Order   delivery document
     Sales Invoice    finance document

Stage 2 live preview must reproduce this latest CARRES-SO.pdf from REAL
order data.

PDF bytes remain the single source of truth.
pdf.js is viewer-only.
Print uses the same PDF bytes.
```

**This is the Golden SO. Stage 2 code may not "optimise" back toward the
older renderer.** The gap between the current app renderer and the Golden SO
(missing category bands, Discount column, Amount in words, Emergency contact,
Proceed date) is Stage 2 work — close it toward the Golden SO, never the
reverse.

## PDF — BYTES ARE THE SINGLE SOURCE OF TRUTH

```
PDF bytes = single source of truth

Preview = pdf.js renders those bytes
Print   = the same PDF bytes

pdf.js is a VIEWER ONLY.
It must never become a second document renderer.
```
`pdfjs-dist` is approved and stays. Canvas rendering is a deliberate choice —
predictable everywhere, and correct for Stage 2's live draft preview. It is
not a screenshot workaround.

## RECORDED GAPS — RE-RANKED BY OWNER 2026-08-09
Owner ruling: these are NOT uniformly "notes". Three are hard blockers and they
are card 3.0. The rest are ranked, not waved away.

```
BLOCKERS — card 3.0, close before anything else in Stage 3
① Column-level GRANTs never inspected.   Blocks the APPLY-only RPC (3.3 / 3.8).
                                          If a role can UPDATE orders through
                                          PostgREST, the RPC gate is theatre.
② 0326 / 0327 not merged to main.        Blocks mechanically.
③ Items fill rate UNKNOWN.               Blocks line-level classification (3.1).

NARROWED
④ Print-DO is a live read (orders.ts:488-495) — a DO printed last week carries a
  value the system can no longer reproduce. Blocks ONLY corrections that would
  alter an ALREADY-ISSUED DO's content (address / floor / lift). Not Gate 6 as a
  whole, not Gate 4.

DOWNGRADED — no longer a blocker
⑤ No `issued_at`. ACCEPT supersedes it. The question that matters is not "when
  was a PDF issued" but WHICH EXACT AMENDMENT DID THE CUSTOMER ACCEPT — answered
  by document_hash + accepted_document_hash + accepted_at (GATES.md GATE 4).

RECORD ONLY
⑥ Commission live read (0245:140-148) — 0272 already freezes closed months and
  guards attribution. Residual exposure: the OPEN month only.
⑦ `orders_dealer_update` has no explicit WITH CHECK. RESOLVED for dealers —
  USING doubles as WITH CHECK (PostgreSQL docs, verbatim). Internal-role exposure
  is handled by GATE 3's server-side RPC.
```

## PARKING LOT
cost / margin (supplier cost belongs to Purchasing) · Amendments register page
(state machine first, page later) · Delivery Orders register · SO PDF layout
finalisation · server pagination beyond the 200 cap.

## HOW THIS CARD IS RUN

One stage at a time. Commit, STOP.

**EVERY STAGE MUST END WITH A PREVIEW THE OWNER CAN LOOK AT.**
Do not report a stage as done with prose. Finish by:

1. Start the dev server and print the exact URL, e.g.
   `http://localhost:5173/operation/orders`
2. Attach screenshots at **1440** AND **1130** of every screen the stage built.
3. List, one line each, what the owner should click to check it.

**A stage without a running URL and screenshots is NOT done.**

The architect then verifies corner-to-corner and returns findings + PASS or a
FIX-LIST before the owner sees it. The owner's only word is
"next" / "approved" / pointing at a cell.

Do not start a stage before the previous one is PASSED.
Do not widen scope. New ideas go to the PARKING LOT.
