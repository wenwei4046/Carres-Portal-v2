# Warehouse / Stock Controlled Convergence Implementation Plan

> **Execution dependency:** This build depends on the separately integrated ERP Master Page Control authority commit `34630b18a91a409adfbd152cfecbc175d33ea4b4` and its audit proposal `744193d99da8ee82604a1f68a217cbfb52c6203c`. Do not duplicate either commit in this branch.

**Goal:** Restore trustworthy Stock Register and exact Unit deep-link access on latest `origin/main`, then continue only into Stock-owned, non-conflicting ERP page convergence.

**Architecture:** Stock keeps the single Unit read authority and exact Unit object route. The register view enriches governed foreign keys with governed names but creates no writer. Receiving/GRN, Delivery/DO, and Purchasing/PO remain the only writers for their facts; external Warehouse receiving pages remain with the active Purchasing convergence task.

**Stack:** PostgreSQL/Supabase migrations, Hono API, React Router, Vitest, TypeScript.

---

### Task 1: Repair the governed Stock Register projection

**Files:**
- Modify: `apps/api/src/routes/ops/stock-register.test.ts`
- Create: `supabase/migrations/0408_the_stock_register_names_its_governed_site_and_holder.sql`

1. Add a migration-contract regression test proving the latest `stock_unit_register_v` definition must expose `site_name` and `holder_name` through governed joins.
2. Run the focused API test and confirm it fails against the current 0373 view definition.
3. Add migration 0408, rebuilding only the read view from `stock_unit_availability_v`, `warehouses`, `stock_operating_parties`, and the latest event lateral read.
4. Preserve `security_invoker`, read-only grants, and the existing API shape; add no row-count assumptions and no writer.
5. Re-run the focused API test and migration-law check.

### Task 2: Restore exact Unit deep links

**Files:**
- Modify: `apps/web/src/pages/operation/OperationApp.test.tsx`
- Modify: `apps/web/src/pages/operation/OperationApp.tsx`

1. Add a route regression test starting directly at `/operation/stock/unit/:unitCode` and proving Unit Detail—not Dashboard—renders while the exact URL remains.
2. Run the focused web test and confirm it fails.
3. Include the Unit object path in the URL-driven route gate and suppress duplicate global chrome for that destination-owned object page.
4. Re-run the focused web test.

### Task 3: Verify the bounded P0 build

1. Run Stock API and OperationApp suites.
2. Run API/Web/shared typechecks, migration law, UI/design guards, and production builds relevant to the changed surfaces.
3. Review the diff against the approved control law and Stock ownership boundaries.
4. Commit on a `codex/` branch and open a PR that records—not duplicates—the two authority commit dependencies.

### Task 4: Delivery gates and production proof

1. Wait for CI and resolve only in-scope failures.
2. Merge only after the authority dependency and Purchasing migration seam are safe.
3. Record the exact merged/deployed SHA.
4. Walk Stock Register and an exact governed Unit deep link with a real Operation role on production.
5. Treat genuine sub-1280 and external Warehouse role walks as unproven until a real supported viewport/account exists; never substitute sample records or an artificial desktop width.
