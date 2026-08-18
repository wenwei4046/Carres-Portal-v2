STATUS: EXECUTED
DATE: 2026-08-16
PR: #840 (Slices 1+2 — DO document model 0356 · Delivery Orders Register · DO object page) · #841 (Slice 3 — every door issues · rebooked trip = new document · cancel voids, 0357) · #842 (Slice 4 — Owner Engine two-line display · Team Work per staff · two new acts)
IMPLEMENTATION: APPROVED — owner verified all sections 2026-08-16, build straight to production.
EXECUTION RECORD (2026-08-18): all four scopes shipped; migrations 0356 + 0357
applied in production through the governed path (rolled-back verification, then
exact-file apply). Supersedes PR #838 (race-losing duplicate of #835 — its
sound structure adopted with credit in #841). `Issue PO` won the known conflict:
`Raise the Purchase Order` never existed in shipped code, only in two
historical card documents. Boundaries reported, not hidden: `Out for delivery`
is registered vocabulary awaiting the warehouse→logistics handover fact;
"Delivery owner notified" is satisfied by the work surfaces (orders MASTER §8:
no separate alert engine); Delivery staff / Finance duties have no roster fact
yet, so their items carry the duty word until the roster exists; per-trip
driver/vehicle facts do not exist (partner_fleet is per-partner) and render
governed absences.

# DELIVERY ORDER — COMPLETE BLUEPRINT (one card, the remaining Sales Order scope)

This card completes the Sales Order blueprint. Locked remaining scope, nothing
else: 1) Delivery Orders Register · 2) Automatic DO issuance · 3) DO Object
Page · 4) Owner Engine work display (My Work / Team Work). The shipped Order
Route canvas and the Slice-3 Finance-exception gate law are NOT reopened.

Read `CLAUDE.md`, `docs/orders/MASTER.md` (§0.1, §7, §8, route law),
`docs/delivery/MASTER.md`, `docs/payment/MASTER.md`, `docs/ui/MASTER.md`,
`docs/COPY-STANDARD.md`, `docs/STATUS-STANDARD.md` on the LATEST `origin/main`.
Execute as CONTINUOUS BUILD: implement in your own slice order → tests →
release gate → PR → CI → merge → deploy → prove SHA → overwrite the owning
MASTERs in the same PRs → report after each deploy. If code structure
conflicts with this card, STOP and report — do not choose.

## 1 · Sidebar (owner ruling — supersedes the SUPPLY CHAIN draft)

```
SALES
├── Sales Orders          (exists)
└── Delivery Orders       (NEW register)

SUPPLY CHAIN              (unchanged: Purchasing · Purchase Orders · Receiving · Supplier Claims)
Delivery work page        (unchanged — execution view, writes nothing)
```

## 2 · The DO principle — one delivery TRIP = one DO

- Most orders: one trip, one DO.
- A split delivery (sofa on a second trip with customer consent — §7 grouping
  law) or goods going to different destinations = one DO PER TRIP, each with
  its own goods lines.
- Numbering: locked `DO-DDMMYY-NNNN` scheme, seeded so retries, refreshes and
  reprints return the SAME number for the same trip. A reprint never mints a
  new DO.

## 3 · Automatic issuance — no button, ever

System issues a DO for a trip when ALL hold:
goods of that trip ready · logistics chosen · customer date AND slot
confirmed · the date is an allowed delivery day (no Sunday / Malaysian public
holiday) · no OPEN Finance exception (Slice-3 law: outstanding alone never
blocks; OPEN exception blocks; CLEARED releases).

Then: DO created → appears in the Delivery Orders Register → Delivery owner
notified. NO Release / Approve / Issue button anywhere. The Order Route
answers "why is there no DO yet"; the Register answers "which DOs exist".

## 4 · Delivery Orders Register

Follows every locked register law (38px rows · Inter 13 · two-line 13/11
grammar · dates `Wed, 12 Aug` (year only when not current) · governed muted
empties · capitalize-up customer names · capsule pills · search/filter/export
per the register standard · row opens the DO object page).

```
DO No · SO No · Customer · Delivery date · Location · Status · Created
```

Statuses (document statuses, not invented words — register in
STATUS-STANDARD/COPY-STANDARD):
`Created → Out for delivery → Delivered`, plus `Delivery exception`
(ONE exception + one reason: customer unreachable · customer rejected date ·
driver absent · vehicle breakdown · condominium entry refused · lift booking
not done · delivery failed · goods damaged · wrong goods · photo missing ·
loan not collected).
There is NO "Waiting for goods" status — a DO cannot exist before goods are
ready; waiting lives on the Order Route.

The register shows NO owner, NO avatar, NO action sentence (a register finds
documents; work lives in My Work / Team Work).

## 5 · DO Object Page (read-only facts + doors)

Header: `DO-170826-5050 · SO-1321 · {CUSTOMER NAME}` + `Print ▾` (reprint =
same number). Blocks, in order:

```
CUSTOMER            name · phones · address of THIS trip
GOODS               this trip's lines only (human words first, SKU mono second line)
DELIVERY DETAILS    date · slot · logistics partner · driver · vehicle
SOURCE SALES ORDER  door: Open SO-1321 →  (and the SO links back to its DOs)
DELIVERY STATUS     Created / Out for delivery / Delivered / Delivery exception + reason
DELIVERY PHOTO      photo, uploader, time — or the governed empty state
SIGNATURE / PROOF   signed doc facts
LOAN COLLECTION     only when a loan exists (collect-back on this trip)
HISTORY             who did what, when
```

Everything renders facts owned by other modules. Editing customer/order facts
happens on the SO object page; delivery execution happens on the Delivery
page. This page writes nothing.

## 6 · Failure and void (owner rulings 2026-08-16)

- Failed delivery: the DO keeps `Delivery exception` + reason FOREVER — it is
  never rewritten as Delivered. When a new date is booked, the system issues a
  NEW DO for the new trip; the old one stays as history, both linked to the SO.
- Staff can never delete or void a DO. Only an order cancellation or a
  system-side reschedule voids one, recording reason + actor + time.

## 7 · Owner Engine — work display (renders the EXISTING ladder, invents nothing)

THE ACTION CATALOG IS THE EXISTING LAW — this card defines NO new actions.
Render the ladder actions exactly as ruled in `docs/orders/MASTER.md` §7/§8
and the purchasing sections (verify wording on origin/main):
`Ask customer for a delivery date` · `Call {customer} — book delivery date` ·
`Issue PO` · `Call {supplier} — confirm ready date` · `Check in from
{supplier}` · `Assign logistics` (owner re-ruling 2026-08-16, supersedes the
3-working-days law: due WITHIN THE DAY the PO is issued; stock-source orders
with no PO: within the order day — update §7 in the MASTER accordingly) · `Call {logistics} — confirm delivery date` · `Deliver today` ·
`Upload delivery photo` (due 1 working day after) ·
`Collect RM {amount} from {customer}` (due T−1).
NEW actions added by this card, register in COPY-STANDARD as new law:
`Collect the loan sofa` (delivery staff, due the delivery day) ·
`Resolve the payment exception` (Finance owner, due immediately).

KNOWN CONFLICT TO RESOLVE, NOT CHOOSE SILENTLY: the old law says `Issue PO`;
the shipped Order Route canvas says `Raise the Purchase Order`. One act may
have ONE sentence. Check which origin/main uses, unify everywhere in the same
PR, and report which sentence won and where the other appeared.

UNIT ALLOCATION IS AUTOMATIC — never a staff action (owner ruling
2026-08-16): purchased goods bind to their SO at Check in; stock-source goods
bind at order creation. The only human moment is a shortage conflict — an
amber exception naming the competing orders, not a routine action. If a
manual unit-picking door exists on main, STOP and report it.

OWNER RULES (facts → duty, from the Work Engine roster + buddy cover; never
hand-picked, never per-order assignment):

```
Purchase / supplier date   → PO Duty
Receive goods              → GRN Duty
Logistics / appointment    → Delivery owner
Delivery execution / photo → Delivery staff
Loan collection            → Delivery staff
Collect money / exception  → Finance owner
Customer date commitment   → Responsible salesperson
```

TWO-LINE DISPLAY GRAMMAR (owner approved 2026-08-16) — line 1: the short
action sentence, 13px; line 2: names · document numbers · due date, 11px
grey. Names and numbers live on line 2, never stuffed into line 1:

```
[YJ] Confirm the ready date
     Sydney Furniture · PO-2048

[DL] Assign logistics
     SO-1321 · PO issued Mon, 17 Aug — due same day
```

Line-1 short forms are the registered DISPLAY of the legal actions — one
mapping in COPY-STANDARD, no second definition of any act.

WHERE OWNERS APPEAR (initials chip / avatar ON the action):
- SO Object Page → Order Route nodes (already shipped — keep)
- DO Object Page action lines
- My Work: only the signed-in person's actions
- Team Work: grouped per staff — avatar · full name · `{n} actions to do` ·
  `{n} late` · the action list. Never a bare word like `open` — every count
  says WHAT it counts.
- Every action shows its due DATE (`due Wed, 20 Aug`); a late one shows
  `Late — was due Mon, 18 Aug`. The words Today / Tomorrow are BANNED as
  dates (COPY-STANDARD) — always the real date. (`Deliver today` stays — it
  is a ruled action NAME, not a date.)

WHERE OWNERS NEVER APPEAR: Sales Orders Register and Delivery Orders Register
(clean any owner/next-action remnants from the SO register in this card).
History records: owner rule fired · actual owner · buddy cover · created ·
due date · completed by · completed time · late state.

## 8 · Copy

Empty states answer three questions (what is missing · why · who does what
next). BANNED: `No data` · `No results` · `Not available`. Every new string
through `docs/COPY-STANDARD.md` in the same PR.

## 9 · The whole relationship

```
Sales Order confirmed
    ├── Goods work starts          (Purchasing / Receiving / Stock)
    ├── Logistics work starts      (assign · confirm date + slot)
    └── Money collection starts
            │
    Order Route  =  why there is no DO yet
            │  all conditions met
            ▼
    SYSTEM issues DO  ──►  Delivery Orders Register (SALES sidebar)
            │                       │
            ▼                       ▼
    Delivery page executes    DO Object Page (facts + proof)
    the trip                  linked both ways with the SO
```

## STILL LOCKED — do not touch

Order Route canvas as shipped · Slice-3 Finance-exception gate law · §7
delivery actions and §8 gates (this card gives them a register and a page,
changes no trigger) · order-money engine · SO Object Page · all register
template laws · POS/Sales Portal · database write ownership per module.

## TESTS AND DEPLOY — MANDATORY, EVERY SLICE

- Every slice ships WITH its tests in the same PR. Minimum coverage:
  idempotent DO numbering (same trip retried/refreshed/reprinted → the SAME
  DO, never a second) · auto-issuance fires only when ALL conditions hold and
  never renders a Release/Approve control · split-trip orders produce one DO
  per trip with the right goods lines · register columns/statuses/empties ·
  DO page blocks read-only · My Work shows only the signed-in user ·
  Team Work counts `{n} actions to do` / `{n} late` correctly · failed
  delivery keeps its exception and a rebooked trip creates a new linked DO ·
  staff cannot void.
- GitHub CI must be GREEN before every merge. A red or skipped pipeline never
  merges.
- Every merge DEPLOYS, and the deploy must prove the exact merged SHA on all
  five canonical surfaces before the slice is reported done.
- If any slice needs a DATABASE MIGRATION: it goes through the governed apply
  path and must be APPLIED IN PRODUCTION before the slice is reported done —
  report the migration numbers applied. Never ship UI whose saves silently
  fail because the migration is pending (the 0354 lesson).
- The final report states: tests added/passed per slice · CI run results ·
  migration numbers applied · deployed SHA per surface. Anything unverified
  is listed as NOT VERIFIED, never implied as done.

## Acceptance boundary

Authenticated production verification at 1440×900 and ~920px: sidebar shows
Delivery Orders under SALES · a ready order auto-produces a DO that appears in
the register with the same number on retry and reprint · register columns,
statuses, dates, empties and typography per the locked laws, zero owner
columns · a split-trip order carries two DOs, each with its own goods lines ·
DO object page renders every block read-only with working doors both ways ·
failed delivery keeps exception + reason and a rebooked trip creates a new
linked DO · staff cannot void · My Work shows only the signed-in user's
actions with initials; Team Work groups per staff with `{n} actions to do` / `{n} late` counts and real due dates ·
registers show no avatars. Overwrite `docs/orders/MASTER.md`,
`docs/delivery/MASTER.md`, `docs/COPY-STANDARD.md` (and `docs/ui/MASTER.md`
only if an ERP-wide rule is added) in the same PRs under the MASTER OVERWRITE
LAW. Update this card to STATUS: EXECUTED with PR numbers. CI green before
merge; deploys must prove the SHA on every canonical surface.
