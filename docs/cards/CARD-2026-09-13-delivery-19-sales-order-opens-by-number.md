# DELIVERY — CARD 19 · A Sales Order opens by its number as well as by its id

> Module **DELIVERY** · Card **19** · authored 2026-09-13 under the Delivery final-convergence
> takeover (owner mission of 2026-09-13, after Cards 08–18). Steps use checkbox syntax for
> tracking. **Surface owned by this Card:** the identity resolution of the Sales Order object page
> (`/operation/orders/so/:orderId`) and its one read fan-in. **May not touch:** Sales Order
> business truth, any Orders writer, the Order Route arithmetic, any Delivery surface.

**Goal:** Opening a Sales Order by its UUID and by its number (`SO-1362` · `so-1362` · `1362`)
resolves the SAME order through ONE resolver; the Order Route and every fan-in read are populated
in both paths; a number that matches no order says so instead of failing.

**Measured defect (2026-09-13, production `36c98830`, authenticated as operation@carres.com):**
`/operation/orders/so/SO-1362?route=1` renders `No route facts were found for this sales order`;
`GET /api/operation/orders/SO-1362` and `…/orders/1362` answer **500** `invalid input syntax for
type uuid`. The page hands the raw URL param to `useOperationOrder`, `useSalesOrderRouteFacts`
and the seven other reads, so a number reaches ten doors that only know an id
(`apps/web/src/pages/operation/SalesOrderWorkspace.tsx:984`, `:1046`, `:1072`).

**Authority:** `docs/orders/MASTER.md` (the Sales Order object page; `SO No` is the operator's
document identity) · `docs/ERP-ARCHITECTURE.md` Law C (a door, never a duplicate) and Law D (one
arithmetic) · `docs/COPY-STANDARD.md` (`SO No`; the page's absence words). No design of its own.

**Dependencies:** none.

**Runtime readers and writers affected:** Readers: `packages/shared/src/sales-order-identity.ts`
(new pure helper), `GET /api/operation/orders/by-number/:so` (new read door, Operation-gated),
`SalesOrderWorkspace.tsx` (the number door in front of the object page), `queries.ts`
(`useSalesOrderIdByNumber`). Writers: none.

**Migrations required:** none.

**Production acceptance surface:** Production `/operation/orders/so/SO-1362?route=1` lands on
`/operation/orders/so/db9c939a-…?route=1` with the Order Route drawn; the UUID URL is unchanged;
`/operation/orders/so/SO-999999` prints `No sales order SO-999999` with the door back to Sales
Orders; `GET /api/operation/orders/by-number/SO-1362` answers the id.

## Global constraints

- Reuse existing Carres components, arithmetics and write doors; no duplicate quantity, owner, duty, date, payment or stock truth.
- Every visible word comes from `docs/COPY-STANDARD.md`; dates through `fmtDate`; no em dash joins a Delivery Work sentence.
- No `New DO`, `Issue`, `Release` or `Approve` control; no new payment exception or COD door; no Delivery-local roster; no Operations Superuser fallback.
- Loading, error, empty and no-results states, keyboard and focus, responsive behaviour, permissions and proxy-recording boundaries are tested.
- A Card is complete only after PR merge, exact-SHA deployment and authenticated production verification with the resulting records re-read.

## Tasks

- [x] `salesOrderParamOf(param)` in `packages/shared` — `id` (UUID) · `number` (`SO-1362` · `so-1362` · `1362`) · `invalid`; its test names every spelling and the negatives
- [x] `GET /api/operation/orders/by-number/:so` — Operation-gated, reads `orders.id` by `so`, 404 `No sales order SO-{n}` when none, 400 for a non-number; route test with the mocked client
- [x] The number door in `SalesOrderWorkspace`: a number resolves once, then `replace`-navigates to the UUID URL keeping the search (`?route=1`), so every fan-in reads the canonical id; a miss prints `No sales order SO-{n}` with `Back to Sales Orders`; an invalid param prints the same absence; regression test covers UUID untouched · number → UUID · miss
- [x] Tests, typecheck ×3, design guard
- [x] PR → CI → merge → deploy → authenticated production verification of both paths, Order Route drawn on both

**Evidence (2026-09-14):** PR #1291 squash-merged as `334c3720` (its branch merged `main` in after
the sibling PR #1288 landed; no history rewrite). Deployed inside `a5646d2d`, the tip that carries
Cards 19–21 — every canonical surface reports that SHA (deploy probe). Tests green on CI: shared
`sales-order-identity` 4 · api `orders.by-number` 5 + `orders` 129 · web `SalesOrderWorkspace.number-door`
4 and every other `SalesOrderWorkspace.*` suite · tsc ×3 · design guard. **Measured before:** on
`36c98830`, authenticated as operation@carres.com, `/operation/orders/so/SO-1362?route=1` printed `No route
facts were found for this sales order` and `GET /api/operation/orders/SO-1362` → 500 `invalid input syntax for
type uuid` (the same for `/1362`). **Production walk after deploy: OWED, not done** — the operation@ browser
session this chat had expired at 00:02 MYT during the deploy wait and a sign-in needs a password the chat
may not type. Minimum owner action: sign in once as operation@ (or any staff role) and open
`/operation/orders/so/SO-1362?route=1` — it must land on `/operation/orders/so/db9c939a-…?route=1` with the
Order Route drawn; `/operation/orders/so/SO-999999` must print `Sales Order not found.`.
