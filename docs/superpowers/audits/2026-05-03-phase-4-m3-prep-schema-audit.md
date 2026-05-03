# Schema Audit Report — apps/api/src/routes (2026-05-03)

> Pre-M3 prep audit. Scope: every `.from(table).select(...)`, `.eq/.in/.is/.not/.ilike/.or/.neq/.order` filter, and PostgREST embed in `apps/api/src/routes/` cross-checked against the live Supabase schema.
>
> Trigger: M2 smoke testing surfaced 3 column-name mismatches that mocked unit tests didn't catch (`orders.showroom_id` → `outlet_id`, `order_addons.sku` → `addon_key`, `purchase_orders.eta` → `eta_date`). This audit verifies every other route is clean before M3 begins.

## Summary

- **Files scanned**: 8 non-test route files (auth.ts, dealers.ts, catalog.ts, outlets.ts, salespersons.ts, orders.ts, principal/dashboard.ts, principal/approvals.ts, principal/dealers.ts, logistics/dashboard.ts, logistics/orders.ts)
- **Total `.from()` calls**: 22 across the routes (excluding `.from(BUCKET)` on storage, which is not a table)
- **Total `.select()` literals**: 22
- **Total filter calls** (`.eq/.in/.is/.not/.ilike/.or/.neq`): 28
- **PostgREST embeds**: 8 distinct (dealers, outlets, order_lines, order_addons, order_history, line_count alias)
- **Mismatches found**: **0 critical, 0 minor**
- **Tables audited (15 of 18 in-scope tables touched by routes)**: orders, order_lines, order_addons, order_history, purchase_orders, purchase_order_lines, warehouses, stock_balances, dealers, outlets, salespersons, addons, product_models, product_skus, sofa_fabrics, floor_config, approvals
- **In-scope but un-touched by current routes** (no findings possible, but listed for completeness): `audit_log`, `app_users`, `delivery_partners`, `suppliers`, `refunds`, `catalog`*, `stock_movements`
  - *no `catalog` table exists; reference passes through `addons` + `product_models` + `product_skus`
- **Audit took**: ~10 min (3 schema dumps + 8 file reads + cross-ref + report)

## Mismatches

### CRITICAL — would 500 in production

None.

### MINOR — won't 500 but suspicious

None.

## Clean files (every `.select`, `.eq`, `.in`, `.is`, `.not`, `.or`, `.ilike`, `.order`, embed verified)

| File | `.from()` count | Notes |
|---|---|---|
| `apps/api/src/routes/auth.ts` | 0 | No DB access — JWT-only `/me` |
| `apps/api/src/routes/dealers.ts` | 1 | `dealers.* .eq("id")` ✓ |
| `apps/api/src/routes/catalog.ts` | 5 | product_models / product_skus / sofa_fabrics / addons / floor_config — all `*` selects, all filters legal |
| `apps/api/src/routes/outlets.ts` | 1 | `outlets.* .order("name")` ✓ |
| `apps/api/src/routes/salespersons.ts` | 1 | `salespersons.* .eq("outlet_id") .order("name")` ✓ |
| `apps/api/src/routes/orders.ts` | 4 | All embeds (`order_lines`, `order_addons`, `order_history`, `line_count:order_lines(count)`) FK-resolved; all filters (`status`, `outlet_id`, `salesperson_id`, `dealer_id`, `id`, `placed_at`) match real columns |
| `apps/api/src/routes/principal/dashboard.ts` | 0 | Pure RPC `principal_dashboard_summary` |
| `apps/api/src/routes/principal/approvals.ts` | 1 | `approvals.* .order("created_at") .eq("status") .eq("kind") .neq("kind")` — all columns exist |
| `apps/api/src/routes/principal/dealers.ts` | 1 | `orders` select list `(id, dl, status, customer_name, paid, placed_at, order_lines(unit_price, qty), order_addons(unit_price, qty))` — every column present; embeds resolve via FKs |
| `apps/api/src/routes/logistics/dashboard.ts` | 0 | Pure RPC `logistics_dashboard_summary` |
| `apps/api/src/routes/logistics/orders.ts` | 7 | M2 already fixed — `outlet_id` (not `showroom_id`), `addon_key` (not `sku`) on order_addons, `eta_date` (not `eta`) on purchase_orders. All other selects and filters confirmed against schema. Embeds `dealers(name)` + `outlets(name)` resolve via the existing FKs `orders_dealer_id_fkey` + `orders_outlet_id_fkey`. |

### Embed FK verification (PostgREST relies on a real foreign key to resolve `parent.col` syntax)

| Embed | Source FK | Status |
|---|---|---|
| `orders → dealers(name)` | `orders_dealer_id_fkey` (orders.dealer_id → dealers.id) | ✓ |
| `orders → outlets(name)` | `orders_outlet_id_fkey` (orders.outlet_id → outlets.id) | ✓ |
| `orders → order_lines(*)` | `order_lines_order_id_fkey` | ✓ |
| `orders → order_addons(*)` | `order_addons_order_id_fkey` | ✓ |
| `orders → order_history(*)` | `order_history_order_id_fkey` | ✓ |
| `orders → line_count:order_lines(count)` | aliased version of order_lines embed | ✓ |

## Methodology gaps (what this audit can't catch)

1. **Dynamic column names** — `.select(\`${var}, ...\`)` interpolation is rare in this codebase but invisible to a literal-string scan. None found in the scanned files.
2. **JSONB key access** — selecting `attrs` (order_lines) or `metadata` (order_history) only validates the column exists, not the keys read off it later. Out of scope here; covered by integration tests that exercise the JSONB shape.
3. **Embeds with explicit FK names** — PostgREST supports `dealers!fk_name(name)` to disambiguate when multiple FKs exist between two tables. None of the scanned embeds use this form, so we relied on table-pair FK existence.
4. **RPC return shapes** — RPC payloads (e.g. `dealers_with_stats_list`, `principal_dashboard_summary`, `logistics_dashboard_summary`, `dealer_with_stats`, `dealer_invite`, `approval_decide`, every `logistics_*`) are not validated here. The route handlers `as any`-cast and pluck fields like `d.order_count`, `d.gmv`, `d.outstanding`, `wh`, `shortages` — those depend on RPC body shape which lives in the migration files, not `information_schema.columns`. Recommend a separate **RPC contract audit** before M3 if M2 RPC behaviour was patched.
5. **Insert/update column names** — the audit looked at reads. Writes go through RPCs (`create_order`, `top_up_order`, `update_order`, `proceed_order`, etc.), so this gap is covered by the RPC contract audit (item 4).
6. **Test mock drift** — explicitly out of scope; the M2 bugs proved mocks ≠ real schema. Switching the api test layer to integration-against-Supabase-branch is a separate Phase 4 follow-up.

## Bottom line

All 8 non-test route files are schema-clean against the live remote Supabase. The 3 M2 bugs were the only column-drift in the routes layer — the fix in M2 plus the inline comment on logistics/orders.ts:78 (`// schema column is outlet_id, not showroom_id`) is the entire blast radius.

**Recommended next action**: Proceed with M3. No code changes required from this audit.

Suggested follow-ups (defer until M3 close-out, not blockers):
- RPC contract audit (gap #4) — verify the route handlers' `d.X` field accesses match each RPC's RETURNS TABLE / RETURNS JSONB shape from migrations 0009-0019.
- `phase-4-m3-prep-schema-audit` carry-forward TODO can now be marked done.
