STATUS: QUEUED
DATE: 2026-08-20
PR: pending
IMPLEMENTATION: APPROVED — owner commissioned Codex to take over, audit the shipped work, and complete the missing Sales Order → Delivery blueprint on 2026-08-20.
SUPERSEDES ONLY: the navigation ruling that placed Delivery Orders under Sales, plus any claim that PRs #840–#843 completed every Sales Order → Delivery seam. The EXECUTED 2026-08-16 card and its implementation history remain immutable evidence.

# SALES ORDER → DELIVERY COMPLETION RESET

This is the one continuation card for the remaining Sales Order scope. It is a
correction and completion card, not a redesign of the verified Sales Order,
Order Route, Delivery Order or Work pages.

Read the latest `CLAUDE.md`, `docs/ERP-ARCHITECTURE.md`,
`docs/COPY-STANDARD.md`, `docs/01-design-tokens.md`,
`docs/ui/MASTER.md`, `docs/orders/MASTER.md`, `docs/delivery/MASTER.md` and
the EXECUTED Delivery Order card before editing code. Existing code and old
chat are evidence only. The latest MASTER plus this owner-approved correction
are the authority.

## 0 · Final answer first

**A Delivery Order belongs to Delivery.**

The Sales Order owns the customer order and promise. Delivery owns the trip,
Delivery Order, logistics handover, delivery result and proof. Work owns the
projection of the next action and its owner. One record has one home.

The sidebar must therefore read:

```
SALES
└── Sales Orders

DELIVERY
├── Delivery Work
├── Delivery Orders
├── Schedule                 Coming soon until built
├── Delivery History         Coming soon until built
├── Exceptions               Coming soon until built
├── Partners                 Coming soon until built
└── Report                   Coming soon until built
```

`Old Orders (temporary)` remains only until its governed cutover is complete.
It is not part of the target Sales Order information architecture.

The URL may remain `/operation/delivery-orders`; moving a page to its owning
module does not require breaking bookmarks.

## 1 · Audit result — KEEP / FIX / COMPLETE

| Surface or law | Latest-main evidence | Ruling |
|---|---|---|
| Sales Orders Register | built and verified | **KEEP** — clean document Register; no avatar and no next-action column |
| Sales Order Object | built and verified | **KEEP**, then add the complete related-DO list below |
| Order Route canvas | built and verified | **KEEP structure**, fix owner resolution and the node reading hierarchy only |
| `ops_delivery_orders` document model | built by 0356/0357 | **KEEP** — it is Delivery's authoritative document ledger |
| Automatic DO issuance | built and production-verified | **KEEP** — no Issue, Release or Approve button |
| Delivery Orders Register | built | **KEEP columns and behaviour; MOVE under Delivery** |
| Delivery Order Object | built | **KEEP read-only document truth; make all return/deep links resolve under Delivery** |
| My Work / Team Work | built | **KEEP the one Work set; COMPLETE Delivery and Finance roster resolution** |
| Delivery Orders under Sales | shipped old ruling | **FIX** — now conflicts with one-record/one-owner and the expandable Delivery module |
| One `orders.do_number` shown as the whole SO→DO relationship | current shortcut | **FIX** — it is only the current mirror, never the complete list |
| Route owners | Purchasing + Receiving names resolve; other duties fall back | **COMPLETE** — every human action resolves from governed roster/record facts |
| Route node copy hierarchy | compact node exists, but action/fact/context can read as one block | **FIX** — use the three-row Route grammar in §7 |
| Work row copy hierarchy | two-line grammar is built | **KEEP** — Work rows and Route nodes are different templates |
| Money gate | newer 2026-08-19 law exists | **DO NOT REOPEN** — read the latest orders/payment MASTER at implementation time |

No later chat may rebuild a `KEEP` item because an old card is confusing. It
must start with the `FIX` and `COMPLETE` rows above.

## 2 · The three owners — document, action, person

These are different questions and must never be collapsed into one `SO owner`:

1. **Document owner** — which module owns the record and its writes.
2. **Action owner rule** — which duty or business role owns this open action.
3. **Person today** — which roster holder or buddy cover is serving that duty.

One customer order can legitimately involve Sales, PO Duty, GRN Duty,
Delivery Duty and Finance at the same time. That does not mean five people
edit one shared status. Each person closes only the fact owned by their
module. The Sales Order has no fake universal owner and no fake overall
status.

If somebody misses a due action:

- the action stays open under the same rule;
- Team Work shows it as `Late — was due {date}` under that person;
- an active buddy-cover fact moves today's display owner without rewriting
  the original accountability history;
- history records rule fired, original person, cover person, due date,
  completion person and completion time;
- the other two people do not become jointly responsible for the missed act.

## 3 · Automatic Owner Engine — no manager assigns every order

Every action contract must name five things: trigger · owner rule · action ·
due rule · completion fact. The system resolves the person automatically.

| Trigger / action | Governing owner rule | Person source | Completion fact |
|---|---|---|---|
| Ask for the customer's delivery date | Responsible salesperson | Sales ownership on the SO | Customer Delivery exists |
| Issue PO / supplier commitment | PO Duty | monthly PO-duty roster + active cover | PO / standing supplier promise exists |
| Check in goods | GRN Duty | governed GRN-duty roster + active cover | posted Receiving Session |
| Assign logistics | Delivery Duty | Delivery roster + active cover | logistics partner recorded |
| Confirm date + slot | Delivery Duty | Delivery roster + active cover | customer-confirmed booking with evidence |
| Warehouse handover | Warehouse duty for handover step | handover roster/active duty fact | append-only handover event |
| Deliver / arrange new date / upload photo | Delivery Duty or trip executor when a real trip assignment exists | Delivery roster first; explicit trip assignment only when that record exists | result / new booking / photo fact |
| Collect a loan item | Delivery Duty | Delivery roster + active cover | loan record is returned |
| Collect customer money | Finance collection duty | Finance roster + active cover | outstanding becomes zero under the one money arithmetic |
| Resolve a Finance exception | Finance exception duty | Finance roster + active cover | exception is CLEARED with evidence |

### Roster law

- Reuse an existing governed roster if it owns the duty.
- If Delivery or Finance has no authoritative roster table yet, add the
  smallest governed roster fact; do not use `orders.assigned_staff` as a
  universal fallback.
- Never add a free-form owner dropdown to a Sales Order.
- Never manufacture a person from the logged-in user.
- If a duty has no holder, Team Work must show an amber group named
  `{Duty} has no holder`. Do not print `Unassigned`, do not silently give it
  to the salesperson, and do not hide the work.
- My Work contains only actions whose resolved person is the signed-in user
  or whose active cover resolves to that user.

## 4 · Sales Orders Register — document finding only

The Sales Orders Register stays the template for ERP Registers:

- no avatar;
- no owner column;
- no `Next action` column;
- no full workflow sentence inside a cell;
- one row opens the Sales Order object;
- document-number cells are doors to their authoritative objects.

The `DO No` cell is a shortcut, not the Delivery Order ledger:

```
No DO       No delivery order yet
One DO      DO-200826-1234 →
Many DOs    2 Delivery Orders →
```

For many DOs the door opens the Delivery Orders Register filtered to that SO.
It may not pick one number and hide the failed, voided or rebooked documents.

## 5 · Sales Order Object — the complete relationship

Add one read-only **Delivery Orders** block to the Sales Order object. It
reads `ops_delivery_orders` by `order_id`; it never treats
`orders.do_number` as the full history.

```
DELIVERY ORDERS

DO-200826-1234   Created              Thu, 20 Aug · Afternoon
                 Open Delivery Order →

DO-190826-8871   Delivery exception   Customer unreachable
                 Open Delivery Order →
```

Rules:

- list every DO for this SO, newest active document first;
- keep failed, voided and delivered documents visible;
- one trip = one row;
- no DO yet uses the governed empty sentence and points the reader to Order
  Route for the missing facts;
- this block has no create/issue/release button;
- a split or rebooked order can show several DOs without changing the SO.

The Order Route still answers **why no DO yet**. This object block answers
**which DOs already exist**.

## 6 · Delivery Orders Register — under Delivery

Keep the approved eight default columns:

```
DO No · DO date · SO No · Customer · Customer Delivery · Delivery date · Delivery Location · Status
```

Keep: search · filters · column chooser · export · governed date formatting ·
status arithmetic · one trip per row · DO→DO and SO→SO links.

Never add: New DO · Issue · Release · Approve · owner · avatar · next action.
The system creates the document; this page finds documents.

The Delivery expandable module owns the active highlight, breadcrumb and back
destination for the Register and DO Object. A direct old bookmark must still
open the same page with Delivery highlighted.

## 7 · Two different reading templates — never mix them again

### A · Order Route node: three information rows

The stage label is the node header. Below it, a current human-action node uses
three stable rows:

```
PURCHASING                         CURRENT
No Purchase Order yet             row 1 · fact · 13px semibold
[YJ] Issue PO                      row 2 · owner + action · 11px
SO-1319 · due Wed, 20 Aug          row 3 · document + real due date · 11px muted
```

Exact law:

- row 1 = fact/problem, plain primary-school English;
- row 2 = avatar/initials chip plus the short registered action;
- row 3 = document/party and actual due date;
- never place fact + person + action + due date on one line;
- never repeat the customer name when the open object already identifies the
  customer;
- completed/read-only nodes may omit row 2 when no human action remains;
- system actions say `System` and carry no fake avatar.

### B · My Work / Team Work row: two lines

Keep the existing Work law:

```
[YJ] Issue PO
     SO-1319 · LIM KUAN YANG · due Wed, 20 Aug
```

Line 1 is the registered action. Line 2 is party · document · real due date.
The avatar is a separate structured owner element, not text inside the action.
This template remains compact because the page already groups work by person
and date. Route nodes need the extra fact row because they explain a journey.

## 8 · Delivery Order Object — Delivery's document, read-only

Keep the existing object page and its blocks:

Customer · Goods · Delivery Details · Source Sales Order · Delivery Status ·
Delivery Photo · Signature/Proof · Warehouse Handover · Loan Collection ·
History.

It is a Delivery document page. It may link to the Sales Order and Delivery
Work, but it does not edit Sales, Stock, Finance or customer truth. It has
Print, not Create/Issue/Release/Approve/Void.

If an action is open, show it on Order Route, Delivery Work and Work. Do not
turn the read-only DO Object into a second work form.

## 9 · The whole flow

```
SALES ORDER SAVED
      │
      ├──────── GOODS ─────── Purchasing → Receiving → Stock
      ├──────── DELIVERY ──── Assign logistics → confirm date + slot
      └──────── MONEY ─────── Collect / approval / Finance hold by current MASTER
                                   │
                                   ▼
                         DELIVERY ORDER GATE
                         reads the latest governed conditions
                                   │ all conditions true
                                   ▼
                         SYSTEM issues one DO per trip
                                   │
                   ┌───────────────┴────────────────┐
                   ▼                                ▼
          Delivery Orders Register          Delivery Work / Work
          finds document truth              shows owned next actions
                   │                                │
                   ▼                                ▼
          Delivery Order Object             handover → deliver → proof
                   │
                   └──── links back to Sales Order and its full DO list
```

## 10 · What remains to build

### Slice 1 — authority and navigation correction

- Move `delivery-orders` from `section: "Sales"` to `section: "Delivery"`.
- Place it immediately after Delivery Work.
- Update sidebar active-state tests and all current comments/copy that claim
  the Register belongs under Sales.
- Update orders/delivery/ui MASTERs under the overwrite law in the same PR.

### Slice 2 — complete SO ↔ DO lineage

- Read every `ops_delivery_orders` row for the Sales Order.
- Add the related Delivery Orders block to the SO object.
- Make the Sales Orders Register DO shortcut correct for zero/one/many DOs.
- Keep `orders.do_number` only as the current compatibility mirror.
- Prove failed, voided, delivered and rebooked documents remain discoverable.

### Slice 3 — complete automatic owner resolution

- Audit every work rule against trigger/owner/action/due/completion.
- Stop using the Sales Order PIC for Delivery and Finance actions.
- Add/reuse governed Delivery and Finance duty rosters with buddy cover.
- Thread all governed owners into Order Route, My Work and Team Work.
- Show the duty-holder gap explicitly when a roster is empty.

### Slice 4 — restore Route readability

- Implement the three-row Route-node grammar in §7.
- Keep Work rows on their governed two-line grammar.
- Verify zoom, pan, focus, keyboard and screen-reader reading order.
- Do not change route topology or business-state arithmetic.

### Slice 5 — authenticated production acceptance and closure

- Walk the entire acceptance list below at 1440×900 and about 920px.
- Record exact PRs, migrations, CI runs, deploy runs and deployed SHA.
- Only then update this card to `STATUS: EXECUTED` and overwrite the MASTERs
  with the verified current truth.

Each slice includes its tests. Do not merge a red or skipped CI run. If a
migration is required, apply and verify it in production before claiming the
slice complete.

## 11 · Expected files — verify against latest main before editing

Likely navigation and shell files:

```
apps/web/src/pages/portal/portal-nav.ts
apps/web/src/pages/portal/PortalSidebar.test.tsx
apps/web/src/pages/operation/OperationApp.tsx
```

Likely Sales Order / DO lineage files:

```
apps/web/src/pages/operation/SalesOrdersRegister.tsx
apps/web/src/pages/operation/SalesOrderWorkspace.tsx
apps/web/src/pages/operation/DeliveryOrdersRegister.tsx
apps/web/src/pages/operation/DeliveryOrderPage.tsx
apps/web/src/lib/queries.ts
apps/api/src/routes/operation/delivery-orders.ts
their focused tests
```

Likely Owner Engine / Route files:

```
packages/shared/src/work-engine.ts
packages/shared/src/order-actions.ts
packages/shared/src/sales-order-route.ts
apps/web/src/pages/operation/use-open-work.ts
apps/web/src/pages/operation/OperationWork.tsx
apps/web/src/pages/operation/SalesOrderRoute.tsx
apps/web/src/pages/operation/SalesOrderWorkspace.tsx
their focused tests
```

Required documentation owners:

```
docs/orders/MASTER.md
docs/delivery/MASTER.md
docs/COPY-STANDARD.md
docs/ui/MASTER.md only when the route-node grammar is ERP-wide
this card
```

This is not permission to touch every listed file. The implementer must show
the exact diff scope per slice and avoid unrelated rewrites.

## 12 · Tests that must exist

1. Sidebar: Delivery expands to Delivery Work + Delivery Orders; Sales no
   longer contains Delivery Orders; old URL/bookmark still works.
2. Registers: neither Sales Orders nor Delivery Orders exposes owner/avatar/
   next-action columns or a manual DO-create control.
3. SO relationship: zero DO, one DO and many DOs render correctly; many DOs
   include failed, voided, delivered and active documents.
4. Door law: DO→DO, SO→SO, DO object→source SO, SO object→every DO.
5. System issuance: retry/refresh/reprint remains idempotent; no manual button.
6. Owner resolution: every human action maps to the correct governed duty and
   active cover; an empty roster shows the duty-holder gap and never the PIC.
7. My Work: only signed-in/covered actions; Team Work groups per resolved
   person with `{n} actions to do · {n} late`.
8. Route grammar: current human nodes expose fact, owner+action and context+due
   as separate rows; completed/system nodes do not invent owners.
9. Accessibility: node focus, connector reading order, avatar accessible name,
   200% zoom, keyboard navigation and reduced motion.
10. Regression: current money gate, auto DO, rebooking, void, handover, result,
    proof, loan and history rules remain green.

## 13 · Production acceptance

- Delivery Orders is visibly under the expanded Delivery module, not Sales.
- Sales Orders and Delivery Orders Registers remain clean document lists.
- A Sales Order with no DO explains the gap through Order Route.
- A ready trip gets a system-issued DO with no human Issue button.
- A one-DO SO links both ways.
- A rebooked/split SO shows every DO; none disappears behind the mirror field.
- Delivery Orders Register finds the same documents independently.
- DO Object opens, prints the same number and returns to its source SO.
- Purchasing, Receiving, Delivery and Finance current actions display the
  correct roster person/cover.
- A missing Delivery/Finance roster is named as a duty-holder gap.
- A Route node reads as fact → owner/action → document/due, never one crowded
  sentence.
- My Work remains two lines; Team Work remains grouped by person.
- No owner/avatar/next-action column appears on either Register.
- Both desktop widths remain usable without clipped content or a hidden door.

## 14 · Locked boundaries

Do not reopen: Sales Orders page architecture · Order Route topology · Delivery
Order numbering · one trip/one DO · automatic issuance · no manual issue/
release/approve · status arithmetic · failed delivery history · void law ·
handover chain · money/approval/COD law in the latest MASTER · register engine
grammar · Sales Portal/POS · AutoCount import ownership.

Do not edit or reset the EXECUTED 2026-08-16 Delivery Order card. This new card
is the continuation point. Chat, screenshots and old Claude plans are evidence,
not a competing source of truth.
