# CARD 01 — Delivery Monitor Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build only the internal Operations **Monitor** page: a readable
six-operating-day delivery calendar on desktop and one-day delivery list on
mobile, where each delivery opens its existing formal record.

**Architecture:** Reuse the canonical delivery-scope, arrangement and DO facts
already consumed by `OperationDelivery.tsx`, then map them once into calendar
cards through a pure `delivery-monitor.ts` module. Monitor is a read-only
display/navigation surface: issued DO cards open Delivery Order; pre-DO cards
open Edit Delivery. No result, evidence, assignment or document writer belongs
to this Card.

**Tech Stack:** React 18, TypeScript, React Router, TanStack Query, Tailwind
token classes, Lucide icons, Vitest and Testing Library.

**Spec:** This Card is the complete implementation specification. Supporting
authority: `CLAUDE.md`, `docs/ui/MASTER.md`, `docs/COPY-STANDARD.md`,
`docs/delivery/MASTER.md`, and `apps/web/src/lib/design-standard.ts`.

## Global Constraints

- **THIS CARD BUILDS MONITOR ONLY.** Do not redesign Delivery Orders, Delivery
  Order detail or Edit Delivery.
- The four Delivery pages are: `Monitor` → `Delivery Orders` → `Delivery Order`
  → `Edit Delivery`. Only the first is in scope now.
- The Portal may expose `Monitor` and the already-existing `Delivery Orders`
  destination, but this Card may only restore the existing register route; it
  may not change that register's fields, rail, layout or actions.
- Monitor has a page-owned **240px** desktop filter rail. It is not the Portal
  sidebar. There is no 200px rail.
- Monitor writes nothing: no inline edit, assignment, upload, result, proof
  review, drag/drop reschedule or bulk action.
- A planned time window ending does not prove delivery and creates no automatic
  “result needed” status by itself.
- DO issue stays automatic through the existing governed gate. Do not add `New
  DO`, `Issue`, `Release` or `Approve`.
- Desktop shows a six-operating-day calendar excluding Sunday. Mobile
  automatically shows a single-day list; never squeeze the desktop grid into a
  phone viewport.
- Every person, partner and phone comes from persisted data. Do not invent or
  hard-code people. Chan is a known NETS contact/boss, not automatically a
  driver. Tan is unconfirmed and must not appear.
- HOUZS's confirmed company contact is `011-11108855`, stored/read through
  `delivery_partners.contact`; Monitor does **not** show phone numbers on cards.
- Preserve the current evidence formats and workflows untouched. No video work
  is in scope.
- UI uses repository tokens and governed components. No duplicated token hex,
  hand-rolled list-page chrome or new UI library.
- `AGENTS.md` references a missing `docs/UI-KIT.md` on 2026-09-04. Reconcile that
  repository instruction before runtime UI edits; do not claim to have read a
  file that does not exist.

---

## 1 · Employee job and navigation boundary

The user is the signed-in Operations employee who needs to answer:

> What customer deliveries are planned across the next operating days, and
> which existing record should I open to continue the work?

One consistent example holds the date behaviour:

- On **Friday, 4 September 2026**, the selected desktop range is
  **Thursday, 3 September – Wednesday, 9 September 2026**.
- Visible days are Thu 3, Fri 4, Sat 5, Mon 7, Tue 8 and Wed 9 September.
- Sunday 6 September is omitted.
- A card with an issued DO opens the existing Delivery Order object.
- A card without a DO shows `No delivery order yet` and opens the existing Edit
  Delivery page. Monitor does not issue the DO.

The four pages have distinct jobs:

| Page | Job | In this Card? |
|---|---|---|
| Monitor | Plan/read delivery days and open the right record | **Yes** |
| Delivery Orders | Find and finish formal DO records | No change |
| Delivery Order | Read one formal DO and its evidence/history | No change |
| Edit Delivery | Write arrangement/result/evidence | No change |

---

## 2 · Exact Monitor UI

### 2.1 Desktop

The drawing begins inside the page content. The global Portal sidebar is not
shown.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Monitor                                                     🔔  ?  ⚙          │
├────────── PAGE-OWNED FILTER RAIL · 240px ─────────┬───────────────────────────┤
│ [Hide filters]                                   │ ‹  Thu, 3 Sep – Wed, 9 Sep ›│
│                                                  │ Search                    │
│ DELIVERY SCHEDULE                                ├──────┬──────┬──────┬───────┤
│   Calendar                                  count│ Thu 3│ Fri 4│ Sat 5│ Mon 7 │
│   No confirmed date                         count│ Sep  │ Sep  │ Sep  │ Sep   │
│   Overdue                                   count│      │ card │      │ card  │
│                                                  │      │      │      │       │
│ NEEDS CHECKING                                   ├──────┴──────┴──────┴───────┤
│   Failed Delivery                           count│ Tue, 8 Sep       Wed, 9 Sep │
│   Delivered — Proof Required                count│ card             card        │
│   Waiting for warehouse                     count│                               │
│                                                  │                               │
│ REGION                                           │                               │
│   Kuala Lumpur                              count│                               │
│   Selangor                                  count│                               │
│                                                  │                               │
│ LOGISTICS                                       │                               │
│   NETS                                      count│                               │
│   AL                                        count│                               │
│   HOUZS                                    count│                               │
│   No logistics picked                      count│                               │
└──────────────────────────────────────────────────┴───────────────────────────────┘
```

The range is six consecutive operating days. Previous/next moves exactly six
operating days and persists the first visible date in the URL. Search and rail
filters also persist in the URL, so Back restores the same calendar state.

Cards stack inside each day and order by:

1. confirmed time-window start;
2. customer name using locale-aware comparison;
3. stable order/leg identifier.

Do not render an hour-by-hour vertical timeline. The planned window is shown as
text; card height does not imply an actual duration. An empty day says `No
deliveries`.

### 2.2 One card

```text
┌────────────────────────────────┐
│ 11:00–13:00                    │
│ {DO No OR No delivery order yet}│
│ {Customer from Sales Order}    │
│ {City / locality}              │
│ {Model · variant × quantity}   │
│ {Logistics Partner}            │
│ {ETA when recorded}            │
├────────────────────────────────┤
│ {one derived delivery status}  │
└────────────────────────────────┘
```

Only the following facts display:

| Field | Source | Why shown | Card action |
|---|---|---|---|
| Planned window | `ops_delivery_arrangements.confirmed_time`, with governed transition fallback only | Place card within the day | Read-only |
| DO No | `ops_delivery_orders.do_number` for this trip/scope | Open formal document | Opens Delivery Order |
| No delivery order yet | absence of an issued DO | Explain why SO is the available door | Opens Edit Delivery |
| Customer | `orders.customer_name` | Identify stop | Read-only |
| City/locality | Sales Order delivery address fields | Tell nearby stops apart without printing a wall of address text | Read-only |
| Goods summary | governed order-line and trip-group derivation | Know what travels | Read-only |
| Logistics Partner | `ops_delivery_arrangements.partner_id → delivery_partners.name` | Know who carries it | Read-only |
| ETA | `ops_delivery_arrangements.expected_arrival` | Show a narrower arrival only when recorded | Read-only |
| Delivery status | existing shared delivery progress/status arithmetic | Identify the current fact/exception | Read-only |

Do not show customer phone, Logistics Partner phone, money, internal owner,
driver, vehicle, upload timestamp or actual delivery time on the calendar card.

The entire card is one accessible link target:

```ts
function monitorCardHref(card: DeliveryMonitorCard): string {
  return card.deliveryOrderId
    ? `/operation/delivery-orders/${card.deliveryOrderId}`
    : `/operation/delivery/edit/${card.orderId}`;
}
```

There are no nested buttons or competing click targets.

### 2.3 Mobile

Below the mobile breakpoint, the 240px rail becomes the existing filter drawer
pattern and the visible range becomes one selected operating day.

```text
┌──────────────────────────────┐
│ Monitor                  ☰   │
│ ‹  Fri, 4 Sep 2026  ›        │
│ [Filters]          [Search]  │
├──────────────────────────────┤
│ 11:00–13:00                  │
│ {DO number from record}      │
│ {Customer from Sales Order}  │
│ {City / locality}            │
│ {Goods summary}              │
│ NETS                         │
│ {derived delivery status}    │
├──────────────────────────────┤
│ 14:00–16:00                  │
│ No delivery order yet        │
│ {next customer from record}  │
└──────────────────────────────┘
```

The date heading is sticky, rows are full width, and each full row is at least
44px high. Previous/next skips Sunday. Mobile uses the identical card data and
link arithmetic as desktop.

### 2.4 Copy status

Read `docs/COPY-STANDARD.md` at execution time. Existing governed delivery words
must be reused exactly. `Monitor`, `Calendar`, `No deliveries`, `Hide filters`,
`Show filters`, and `Delivered — Proof Required` are **proposal copy in this
Card** unless the current Copy Standard already governs the exact string. Add
accepted new wording to Copy Standard in the same PR; do not call unanswered
copy approved.

---

## 3 · File structure

| File | Responsibility |
|---|---|
| `apps/web/src/pages/operation/delivery-monitor.ts` | Pure six-day window, day grouping, card mapping, filtering, counts and href arithmetic |
| `apps/web/src/pages/operation/delivery-monitor.test.ts` | Unit tests for dates, filters, ordering, counts and routing |
| `apps/web/src/pages/operation/OperationDelivery.tsx` | Monitor page composition and responsive rendering only |
| `apps/web/src/pages/operation/OperationDelivery.test.tsx` | UI, accessibility, URL and no-write contract |
| `apps/web/src/pages/portal/portal-nav.ts` | Expose Monitor and retain the existing Delivery Orders door |
| `apps/web/src/pages/portal/PortalSidebar.test.tsx` | Navigation labels/routes/selection |
| `apps/web/src/pages/operation/OperationApp.tsx` | Route Monitor and restore existing Delivery Orders component route without redesign |
| `apps/web/src/pages/operation/OperationApp.test.tsx` | One header and route preservation |
| `apps/web/src/lib/queries.ts` | Only add missing canonical read fields if current DTO lacks them |
| `apps/api/src/routes/operation/orders.ts` or existing delivery read route | Only add missing read fields; no new writer |
| `docs/delivery/MASTER.md` | Replace the current unified-page placement with the four-page map and Monitor boundary |
| `docs/COPY-STANDARD.md` | Register only accepted Monitor copy |

Explicitly untouched:

```text
apps/web/src/pages/operation/DeliveryOrdersRegister.tsx
apps/web/src/pages/operation/DeliveryOrderPage.tsx
apps/web/src/pages/operation/EditDelivery.tsx
apps/web/src/pages/operation/components/DOAttachModal.tsx
apps/web/src/pages/partner/**
apps/api/src/routes/partner/**
supabase/migrations/**
```

---

## 4 · Interfaces

Create the pure model in `delivery-monitor.ts`:

```ts
export interface DeliveryMonitorCard {
  scopeId: string;
  orderId: string;
  deliveryOrderId: string | null;
  doNumber: string | null;
  confirmedDate: string;
  confirmedTime: string | null;
  expectedArrival: string | null;
  customerName: string;
  locality: string | null;
  goodsSummary: string;
  logisticsPartnerId: string | null;
  logisticsPartnerName: string | null;
  region: string | null;
  statusKey: string;
  statusLabel: string;
}

export interface DeliveryMonitorFilters {
  schedule: "calendar" | "no_confirmed_date" | "overdue";
  checking: string | null;
  region: string | null;
  logisticsPartnerId: string | "none" | null;
  search: string;
}

export function operatingDaysFrom(
  firstDate: string,
  count?: number,
): string[];

export function buildDeliveryMonitorCards(
  input: DeliveryMonitorSource,
): DeliveryMonitorCard[];

export function filterDeliveryMonitorCards(
  cards: readonly DeliveryMonitorCard[],
  filters: DeliveryMonitorFilters,
  visibleDays: readonly string[],
): DeliveryMonitorCard[];

export function monitorCardHref(card: DeliveryMonitorCard): string;
```

`operatingDaysFrom("2026-09-03", 6)` must return exactly:

```ts
[
  "2026-09-03",
  "2026-09-04",
  "2026-09-05",
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
]
```

Use the repository's Malaysia business-date helpers where they exist. Do not use
UTC conversion to decide which day a delivery appears under.

---

## 5 · Tasks — execute in order

### Task 1: Lock the pure calendar and navigation arithmetic

**Files:**

- Create: `apps/web/src/pages/operation/delivery-monitor.ts`
- Create: `apps/web/src/pages/operation/delivery-monitor.test.ts`

**Interfaces:** Produces the exact types/functions in §4. Consumes existing
delivery scope, arrangement, DO and status facts; it owns no server data.

- [ ] Write failing tests for the six dates shown in §4, Sunday skip, previous
  and next six-operating-day windows, stable card ordering and empty days.
- [ ] Run
  `pnpm --filter @carres/web test -- delivery-monitor.test.ts` and confirm the
  new module is missing.
- [ ] Implement `operatingDaysFrom`, card mapping, filters, mutually accurate
  rail counts and `monitorCardHref`.
- [ ] Test that a DO card opens the DO object and a no-DO card opens Edit
  Delivery.
- [ ] Test that expired planned time alone does not change the result/status.
- [ ] Re-run the focused tests until green.
- [ ] Commit only the pure module and tests.

### Task 2: Build the desktop Monitor page

**Files:**

- Modify: `apps/web/src/pages/operation/OperationDelivery.tsx`
- Modify: `apps/web/src/pages/operation/OperationDelivery.test.tsx`
- Modify only if needed: `apps/web/src/lib/queries.ts`
- Modify only if needed: the existing Operations delivery read route and tests

**Interfaces:** Consumes Task 1's pure model. Produces no reusable writer.

- [ ] Replace the existing Delivery register composition tests with failing
  Monitor tests for one destination header, toolbar, 240px page rail, six day
  columns, card fields, empty-day sentence and whole-card link.
- [ ] Add failing tests proving no checkbox, bulk toolbar, Save, upload,
  assignment, result or drag/drop control renders.
- [ ] Run the focused component test and confirm the old UI fails the new shape.
- [ ] Implement the desktop UI using governed tokens/components and Lucide icon
  sizes only.
- [ ] Keep date/filter/search state in URL parameters and test Back restoration.
- [ ] Add read fields only when absent from the current canonical payload; do
  not add a database table, migration or write endpoint.
- [ ] Run focused tests and typecheck until green.
- [ ] Commit the desktop Monitor slice.

### Task 3: Add the mobile daily list

**Files:**

- Modify: `apps/web/src/pages/operation/OperationDelivery.tsx`
- Modify: `apps/web/src/pages/operation/OperationDelivery.test.tsx`

**Interfaces:** Consumes the same cards, filters and href from Task 1.

- [ ] Add failing viewport tests showing a one-day list, filter drawer, sticky
  date heading, 44px row target and previous/next Sunday skip.
- [ ] Add a failing test proving the six-column desktop calendar is not rendered
  in the phone layout.
- [ ] Implement the responsive daily list without duplicating card mapping or
  navigation logic.
- [ ] Run focused tests and accessibility assertions until green.
- [ ] Commit the mobile slice.

### Task 4: Expose the destination without changing the other three pages

**Files:**

- Modify: `apps/web/src/pages/portal/portal-nav.ts`
- Modify: `apps/web/src/pages/portal/PortalSidebar.test.tsx`
- Modify: `apps/web/src/pages/operation/OperationApp.tsx`
- Modify: `apps/web/src/pages/operation/OperationApp.test.tsx`

**Interfaces:** Routes Monitor to `/operation?tab=delivery`; retains/restores the
existing `/operation/delivery-orders`, `/operation/delivery-orders/:doId` and
`/operation/delivery/edit/:orderId` destinations without altering their pages.

- [ ] Write failing navigation tests for `Delivery → Monitor` and `Delivery →
  Delivery Orders`, with only the current route selected.
- [ ] Write a failing route test proving Monitor renders once with no duplicate
  global header.
- [ ] Write regression tests proving the existing register, DO object and Edit
  Delivery routes still reach their existing components.
- [ ] Make the minimum navigation/route changes needed; do not edit the three
  out-of-scope page components.
- [ ] Run portal and OperationApp tests until green.
- [ ] Commit navigation separately from page UI.

### Task 5: Reconcile Master and Copy documents

**Files:**

- Modify: `docs/delivery/MASTER.md`
- Modify: `docs/COPY-STANDARD.md`

**Interfaces:** Documents the four-page map and Monitor read-only contract; does
not specify the still-undesigned internals of the remaining pages.

- [ ] Replace contradictory “one unified Delivery destination” current-law
  text; keep executed historical Cards unchanged.
- [ ] Mark only accepted Monitor strings as approved. Keep unanswered strings
  labelled proposal.
- [ ] State explicitly that the 240px rail is page-owned, not the Portal
  sidebar.
- [ ] State HOUZS contact as company data only where partner master data is
  documented; do not put the number on calendar cards.
- [ ] Commit documentation with the UI slice it governs.

### Task 6: Verify this Card and stop

- [ ] Run:

```bash
pnpm --filter @carres/web test
pnpm --filter @carres/web typecheck
pnpm --filter @carres/web lint
pnpm build
```

- [ ] Walk authenticated Monitor at 1920px, 1440px, 1130px and a phone viewport.
- [ ] Verify Thu 3–Wed 9 September 2026 uses the correct weekdays and omits Sun
  6 September.
- [ ] Verify desktop rail computes to 240px and mobile uses a drawer.
- [ ] Verify card with DO opens Delivery Order; card without DO opens Edit
  Delivery.
- [ ] Verify HOUZS may appear as a partner label but `011-11108855` does not
  appear on a calendar card.
- [ ] Verify no runtime file listed under “Explicitly untouched” changed.
- [ ] Paste the required UI checklist into the implementation PR after the
  missing UI authority reference is reconciled.
- [ ] **STOP. Do not continue into Delivery Orders, Delivery Order, Edit
  Delivery or Logistics Partner work.**

---

## 6 · Completion checklist

- [ ] The page title is Monitor.
- [ ] Desktop has one page-owned 240px rail and six readable operating-day
  columns.
- [ ] Mobile has a single-day list and filter drawer.
- [ ] Fields come from canonical records; no sample person is hard-coded.
- [ ] All cards are read-only doors to an existing formal page.
- [ ] No time-window completion inference exists.
- [ ] No Delivery writer, evidence change, partner portal change or database
  migration exists in the diff.
- [ ] The other three Delivery pages remain functionally unchanged.

## 7 · Weakest point and safeguard

The weakest point is the route/navigation change: exposing two Delivery list
destinations can tempt an implementer to “finish” Delivery Orders in the same
PR. The safeguard is mechanical: the verification step checks that
`DeliveryOrdersRegister.tsx`, `DeliveryOrderPage.tsx`, `EditDelivery.tsx`, all
Partner files and all migrations are unchanged. The next page receives its own
Card after Monitor is reviewed.

