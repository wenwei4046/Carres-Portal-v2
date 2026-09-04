# 【WAREHOUSE】 — CARD 03 · Dashboard Calendar → exact-Unit Outbound handover

**Card path:** `docs/cards/CARD-2026-09-04-warehouse-03-dashboard-outbound.md`
**Module:** Warehouse · **Sequence:** 03
**Surfaces:** Warehouse Dashboard's `OUTBOUND SCHEDULE` projection + customer-DO Outbound work
**Status:** **READY FOR BUILD — owner-approved 2026-09-04**
**Lane:** BUILD / DELIVERY
**Depends on:** Warehouse Cards 01/02 · the system-issued Delivery Order · Sales Order exact-Unit
allocation · migration 0363's append-only handover history · migration 0366's Unit authority
**Expected migration:** **YES.** The current handover writer records SKU/quantity and permits one
`handed_over` fact per DO; this Card requires exact Unit IDs, partial batches and an atomic holder
transition. Re-derive the migration number from the tracker, latest main and all active branches at
build time. Do not reserve a number in this document.

---

## 1 · Outcome

Deliver one complete Warehouse vertical slice:

```text
Warehouse Dashboard Calendar
        → click one customer-DO card
Warehouse Outbound, already scoped to that date and DO
        → scan/check/pack the exact required Unit IDs
        → record an evidence-backed physical handover
        → only the handed-over Units change Who has it
```

The formal Delivery Order remains the read-only source document. `DO No` opens it. Warehouse never
opens `Edit Delivery` from this flow and never edits the customer date, route, partner, SO, DO,
price, payment, Delivery Result or customer proof.

This is deliberately **Dashboard + its Outbound destination in one Card**. Shipping the Calendar
alone would create a dead card click because Outbound is currently `Coming soon`; shipping Outbound
alone would leave the owner-approved entry point dead. Inbound remains a later Warehouse scope.

This Card makes the **customer Delivery Order source** live first. Transfer, Supplier Return and
Repair sources join Outbound only when their owning objects and exact-Unit scopes exist. They are
not fabricated from notes or generic stock movements here.

## 2 · Authority — read before changing code

Read the latest versions of:

- `CLAUDE.md`;
- `docs/ERP-ARCHITECTURE.md` §3.5.1;
- `docs/stock/MASTER.md` §§1–7, 12.6, 12.13 and 13;
- `docs/delivery/MASTER.md` §§3–4 and `WAREHOUSE SCHEDULE AND PARTNER PROJECTION`;
- `docs/ui/MASTER.md`, `docs/COPY-STANDARD.md`, `docs/ACTION-FLOW-STANDARD.md`;
- `docs/01-design-tokens.md`, `docs/02-components.md`, `docs/03-page-patterns.md`;
- `apps/web/src/lib/design-standard.ts` and the current shared kit components;
- Warehouse Cards 01/02 and the shipped handover-chain Card/migration.

`docs/UI-KIT.md`, named by the current root `AGENTS.md`, is absent from this repository snapshot.
Do not recreate or guess it. Use the current frozen UI sources above and re-check this fact on latest
main before build. If `docs/UI-KIT.md` exists there, it supersedes the fallback list exactly as
`AGENTS.md` says.

## 3 · Measured baseline — do not mistake it for the target

Measured on branch `codex/delivery-ui-owner-review` after commit `64a26d03`:

1. `portal-nav.ts` already prints `Dashboard · Inbound · Inventory · Outbound`, but Dashboard,
   Inbound and Outbound are non-link `Coming soon` rows. The named Warehouse landing remains
   Inventory.
2. There is no Warehouse Dashboard or Warehouse Outbound page component mounted by
   `OperationApp.tsx`.
3. `/api/operation/delivery-arrangements/warehouse-schedule` already provides a read-only event per
   exact Unit for whole-order customer Delivery scopes and correctly admits a Warehouse login only
   for its bound Site. It deliberately omits split-journey DOs because exact Units are not yet bound
   to one DO/leg.
4. `useDeliveryWarehouseSchedule()` exists and currently has no screen consumer.
5. `delivery_handover_events` + `delivery_handover_record` preserve the ordered
   `ready_for_handover → handed_over → received_by_logistics` history, but `goods` is
   `[{sku, qty}]`, one event kind is allowed per DO, the writer admits only Operation/Principal,
   and it does not change `ops_stock_items.holder_party_id`.
6. `WarehouseHandoverBlock.tsx` puts those acts on a Delivery work surface. That placement is now
   superseded for Warehouse acts by the approved Outbound page; the DO object remains read-only.
7. `ops_stock_items` is the Unit authority. `stock_unit_events` already records holder changes
   append-only. `stock_operating_parties` already separates Warehouse and Delivery holders.

The build must preserve useful existing facts and readers while closing these measured gaps. It may
not add a second schedule, second Unit allocation or second handover truth.

## 4 · Scope and page addresses

### 4.1 Navigation

- Turn Warehouse `Dashboard` and `Outbound` from `Coming soon` spans into real links.
- Use stable URL state so refresh, share and browser Back preserve the selected six-day range,
  selected date, Site, source and selected DO. A valid implementation may retain the existing
  `?tab=` shell, but it must not keep the scope only in component memory.
- Clicking a Calendar card opens Outbound already narrowed to the card's actual date and source DO.
- Clicking `DO No` is a separate link to `/operation/delivery-orders/{doNumber}` and must not also
  trigger the card's Outbound navigation.
- Browser Back restores the Calendar range, filters and scroll position.
- Once this useful Dashboard projection is live, change the named collapsed-Warehouse landing from
  Inventory to Dashboard. Do not derive the landing from row order.

### 4.2 The Card's intentional partial-module boundary

Dashboard opens on the live `OUTBOUND SCHEDULE` projection. Do not render dead Inbound, Inventory,
Needs checking or Month-end projection controls inside the page. Their approved architecture remains
in `docs/stock/MASTER.md`; each joins when its source facts and destination exist. Inventory remains
its separate, already-live destination.

The local filter rail uses only meaningful live rows under the approved headings
`OUTBOUND SCHEDULE · SITE · SOURCE`. A group with no meaningful choice is omitted rather than drawn
as a dead one-option control. Valid live narrowing in this Card is:

- `OUTBOUND SCHEDULE`: Calendar, not-done work and evidence-not-submitted work, derived from source
  facts rather than stored flags;
- `SITE`: actual governed Site names from the Unit/source scope;
- `SOURCE`: `Delivery Order` when it can narrow against another live source; until then the source
  stays explicit on every card and the one-option group is not rendered.

The left filter rail is **inside the Warehouse page**. It is not the Portal sidebar, does not replace
the Portal sidebar and does not add another module-navigation rail.

## 5 · Dashboard layout — exact composition

There is no KPI wall and no primary action. Dashboard is a read-only projection.

```text
PORTAL SIDEBAR │ Dashboard                                      🔔  ?  ⚙
               ├────────────────────────────────────────────────────────────
               │ [Hide filters]   ‹  Thu, 3 Sep — Wed, 9 Sep  ›    [Search]
               ├──────────────────┬─────────────────────────────────────────
               │ OUTBOUND         │ Thu 3 Sep │ Fri 4 Sep │ Sat 5 Sep │ …
               │ SCHEDULE         │            │            │           →
               │   Calendar       │ [DO card]  │ [DO card]  │ No outbound
               │   Not done       │ [DO card]  │            │ handovers
               │   Evidence not   │            │            │ on Sat, 5 Sep.
               │   submitted      │            │            │ Choose another date.
               │                  │            │            │
               │ SITE             │            one shared vertical scroll
               │   Carres Klang   │
               │   PJ Showroom    │
               └──────────────────┴─────────────────────────────────────────
```

- Use the one Warehouse Destination Header; do not stack `GlobalTopBar` over it.
- The toolbar contains filter visibility, previous/next range, the visible range and search. No
  Refresh button and no Warehouse write control belongs here.
- Desktop keeps all six operating dates in one chronological horizontal sequence. Each date column
  has a readable minimum width; the work area owns horizontal overflow. **Never wrap to `3 × 2`.**
- All date columns share one vertical scroll. Do not create six independently scrolling columns.
- The range uses the existing six-day Warehouse calendar and shared Malaysian holiday source.
  Sundays and governed closed dates are skipped; an unfinished historical item stays under its
  original date.
- A valid empty date says exactly
  `No outbound handovers on {date}. Choose another date.`

### Narrow/mobile composition

Below the width at which the six readable columns fit, remove the horizontal board and render one
selected day as an agenda list. Do not shrink six unreadable columns.

```text
Dashboard                                      🔔  ?  ⚙
[Filters]                ‹  Fri, 4 Sep  ›       [Search]
────────────────────────────────────────────────────────
FRI 4 SEP

DO-2609-019
Carres Klang Warehouse → Petaling Jaya
NETS
Required 2 · Handed over 1 · Not handed over 1
U1-260-020 still needs handover
────────────────────────────────────────────────────────
```

Previous/next changes one operating date. The same data, permissions and click destinations apply
on desktop and mobile.

## 6 · Calendar card — fields, sources and doors

One card is one active customer Delivery Order scope, not one Sales Order and not one Unit.
Aggregation is display-only and every count drills to exact Unit IDs.

| Displayed field, in order | Authoritative source | Why Warehouse needs it | Read-only here | Door |
|---|---|---|---|---|
| Actual handover time, only when it exists | append-only Warehouse `handed_over.recorded_at` | distinguishes an observed act from a booking | yes | Outbound evidence/history |
| `DO No` | system-issued `ops_delivery_orders.do_number` | names the authority to release these goods | yes | formal DO object |
| `From → To` | exact Units' governed Site + Delivery destination | proves origin and physical destination | yes | Outbound scope |
| Logistics Partner / receiving party | Delivery arrangement/DO assignment | tells Warehouse who may receive | yes | Delivery-owned editor, never from this page |
| `Units required` | DO/leg exact-Unit scope supplied by Sales Order allocation | prevents quantity-only release | yes | Outbound exact-Unit list |
| `Handed over` | accepted handover event Unit IDs | shows what physically left | yes | Outbound evidence/history |
| `Not handed over` | required IDs minus accepted handed-over IDs | preserves every Unit still at the Site | yes | Outbound exact-Unit list |
| Current Warehouse fact or shared Work action | append-only preparation/handover facts + shared Work resolver | says what remains physically necessary | yes | Outbound owning action |

Never show Delivery ETA, customer-delivery proof, generic `Failed Delivery`, an editable status or
`Edit Delivery` on a Warehouse Calendar card. A failed customer Delivery appears only when a
governed return/collection source later creates an actual Warehouse physical act.

## 7 · Outbound page — exact-Unit work, not a second DO

The selected date/source opens a dated work listing with these approved defaults:

```text
Required handover · DO No · SO No · SO date · Journey/leg · From · To ·
Logistics partner · Units required · Handed over · Not handed over ·
Warehouse operator avatar · Delivery person avatar · Evidence · Work
```

Clicking/expanding the selected source shows the exact Units. Each Unit row carries Unit ID, product,
reservation/source relationship, check, pack, Warehouse scan, handed-over scan/evidence and the
plain reason it is still not handed over. The formal DO is linked, never copied into this page.

The visible action order is:

1. scan every Unit required by this DO scope;
2. record check and pack for the scanned IDs;
3. read the exact receiving Partner/person and the consequence;
4. record physical handover with actual receiver and required evidence;
5. keep every omitted/refused Unit under the original date with its existing holder.

No generic `Mark done` exists. The accepted physical fact completes the matching work.

## 8 · Exact-Unit transaction and partial handover

The build must replace 0363's quantity-only, one-handover-per-document limitation without editing
or deleting its history.

### Required server invariants

- The DO/leg exact-Unit scope comes from the one Sales Order allocation/DO contract. Warehouse may
  not type, add, substitute or remove the required IDs.
- Split-trip DOs may not be silently omitted or assigned order-level Units arbitrarily. Extend the
  owning DO/allocation contract so each active DO/leg has an exact immutable required scope. If old
  split documents cannot be backfilled deterministically, surface and report them; never guess.
- Ready/check/pack and handover facts name exact Unit IDs. SKU/quantity may remain a derived display
  for legacy readers but may not remain the authority.
- One DO may have multiple append-only handover batches. A Unit can be accepted once for that active
  scope; duplicate scans and repeated submissions are idempotently refused/reconciled.
- One transaction locks the DO scope and Units, validates source, Site, current holder, reservation,
  check/pack prerequisites, receiver and proof, appends the handover/event-to-Unit relationship,
  changes only those Units' `holder_party_id` to the governed Delivery holder, and lets
  `stock_unit_events` record the holder history.
- A partial batch updates only its accepted Unit IDs. Required minus handed-over remains open; the DO
  must not derive collected/out-for-delivery merely because one handover row exists.
- Logistics receipt remains a separate counterparty fact. Its exact-Unit reconciliation may not
  overwrite Warehouse evidence. A mismatch identifies the Unit IDs and remains `Needs checking`.
- A voided/replaced DO, wrong Site, wrong source, ineligible Unit, Unit already handed over, missing
  required evidence, unauthorised role or out-of-order act is refused by the server, not only hidden
  by the client.
- Legacy 0363 rows remain readable, append-only and attributable. A forward migration may normalize
  event-to-Unit relationships or extend the writer; it may not rewrite old evidence to look exact.

The client never sends the destination holder as trusted text. The server resolves the governed
Delivery operating party from the DO/Partner assignment. If that mapping is absent, add one governed
relationship and backfill only deterministic rows; do not match organisations by display-name
guessing.

## 9 · Permissions

- Operation/Principal may read this internal Warehouse projection and proxy-record only through the
  same governed act with the actual external party/person/evidence preserved.
- A personally signed-in Warehouse role sees only its bound Site and customer-DO scopes whose exact
  Units are still at that Site. It may record check, pack and Warehouse handover only.
- Warehouse may not record `received_by_logistics`, Delivery Result or customer proof.
- Delivery/Logistics owns its own receipt/result actions. A user holding both duties records the
  active duty on each separate event; one click may not create both sides.
- No price, payment, supplier cost, unrelated customer, unrelated Site or internal note crosses the
  Warehouse-role payload.

Use the existing Warehouse external shell where that role must perform the mobile handover. Do not
grant the Warehouse role access to the internal Operation shell or broaden table policies. Extend
the same governed RPC/endpoint with assignment checks; do not create a warehouse-only second writer.

## 10 · One acceptance story — all dates are real

Test fixture, not production data:

- Range: `Thu, 3 Sep 2026 · Fri, 4 Sep · Sat, 5 Sep · Mon, 7 Sep · Tue, 8 Sep · Wed, 9 Sep`.
  Sunday 6 Sep is absent.
- `DO-2609-019`, `SO-2609-019`, Tan Wei Ming, Carres Klang Warehouse → Petaling Jaya, NETS.
- Exact required Units: `U1-260-019` and `U1-260-020`.
- On Fri, 4 Sep the card first reads `Required 2 · Handed over 0 · Not handed over 2`.
- Opening the card lands on Outbound already scoped to Fri, 4 Sep and this DO. Opening `DO-2609-019`
  lands on the formal read-only DO instead.
- Warehouse scans/checks/packs both Units. At 11:18 AM it hands over only `U1-260-019`, naming the
  actual receiver and attaching proof.
- After the transaction, only `U1-260-019` has the governed Delivery holder. `U1-260-020` keeps its
  Warehouse holder and remains under Fri, 4 Sep.
- The Calendar card now reads `11:18 AM · Required 2 · Handed over 1 · Not handed over 1`; Outbound
  identifies `U1-260-020` as the remaining work.
- A later valid handover batch for `U1-260-020` produces `Required 2 · Handed over 2 · Not handed
  over 0`. Refresh, narrow/mobile rendering and browser Back all show the same facts.

## 11 · Likely code ownership — verify, do not blindly obey filenames

Expected areas:

```text
apps/web/src/pages/portal/portal-nav.ts
apps/web/src/pages/portal/PortalSidebar.tsx
apps/web/src/pages/operation/OperationApp.tsx
apps/web/src/pages/operation/StockTabs.tsx or a replacement Warehouse shell header
apps/web/src/pages/operation/WarehouseDashboard.tsx                 (new)
apps/web/src/pages/operation/WarehouseOutbound.tsx                  (new)
apps/web/src/pages/warehouse/*                                      (Warehouse-role mobile act)
apps/web/src/pages/operation/components/workspace-rail.tsx          (reuse, do not fork)
apps/web/src/lib/queries.ts
apps/api/src/routes/operation/delivery-arrangements.ts
apps/api/src/routes/operation/delivery-orders.ts
packages/shared/src/delivery-warehouse-schedule.ts
packages/shared/src/schemas/delivery-handover.ts
packages/shared/src/delivery-order-status.ts
supabase/migrations/<re-derived>_warehouse_outbound_exact_units.sql
```

Use existing shared date/holiday, formatter, Header, filter rail, query and handover primitives.
Create a new component only when composition cannot express the approved Calendar/agenda. Do not
copy Delivery Monitor or create a second Calendar engine.

## 12 · Required tests and proof

### Contract tests

- six Warehouse operating dates, correct weekday/date, Sunday/holiday exclusion;
- event-to-card grouping is one DO scope with exact Unit drill-down;
- split DO/leg exact scope and no arbitrary Unit assignment;
- required = handed over + not handed over after zero, partial and complete batches;
- duplicate/wrong-Site/wrong-DO/wrong-holder/voided/missing-proof/out-of-order refusal;
- Warehouse-role Site scoping and write restrictions; Operation proxy attribution;
- partial handover changes only the accepted Units' holder in the same transaction;
- logistics receipt mismatch preserves both exact results and identifies the unmatched IDs;
- old quantity-only 0363 history remains readable and is never presented as invented exact IDs.

### UI tests

- Dashboard/Outbound links replace `Coming soon`; named landing becomes Dashboard;
- no duplicate top bar;
- six desktop columns are one horizontal sequence, not `3 × 2`, with one shared vertical scroll;
- mobile is a single-day agenda with previous/next operating date;
- exact empty sentence;
- card click → scoped Outbound; `DO No` click → DO object; Back restores context;
- field order and exact counts; no ETA, generic Failed Delivery or `Edit Delivery`;
- keyboard activation/focus return for cards, disclosure and links;
- filter groups use the approved headings and never render dead placeholder controls.

### Completion proof

Before marking this Card complete, Claude must:

1. run the relevant shared/API/web tests plus `pnpm --filter @carres/web lint` and the design guard;
2. apply the migration through the governed path and exercise every new RPC branch against the real
   environment, including a partial handover and every role refusal;
3. open the real Dashboard → Outbound → DO → Back flow at desktop and narrow/mobile widths;
4. inspect console/network errors and verify the deployed SHA;
5. record the implementation and production proof in `docs/stock/MASTER.md` without changing the
   approved business law.

Green tests without the real route, transaction and responsive screen walk are not completion.

## 13 · Explicitly outside this Card

- Delivery Monitor or Delivery Orders redesign;
- `Edit Delivery`, partner/date/time/route changes, Delivery Result and customer proof;
- Warehouse Inbound, full Inventory rail re-architecture, Counts & Adjustments, Problems,
  Month-end, Reports or Settings;
- Transfer, Supplier Return or Repair Outbound until their exact owning source objects exist;
- Zone/Rack/Bin, wave/pallet/labour planning, manual quantity correction or a second stock ledger;
- redesign of the Portal sidebar, Quick Rail or the external Warehouse app beyond the minimum
  responsive customer-DO handover door this vertical slice requires;
- build/deploy work by the planning chat that authored this Card.

Delivery Orders planning may continue in parallel. Its later Card must consume the same formal DO
and exact handover facts; it may not pull Warehouse actions back into the DO object or Delivery
Monitor.
