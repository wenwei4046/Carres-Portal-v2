import { Hono } from "hono";
import {
  monthKeyMYT,
  purchaseDemandQuantities,
  purchaseDemandStateOf,
  PURCHASE_DEMAND_OWNER_DUTY,
  type ProductCategory,
  type PurchaseDemandRow,
  type PurchaseDemandState,
  type PurchaseDemandsResponse,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { loadToOrder, type RegisterOrderFact } from "../../lib/purchase-demand-read";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/operation/purchase/demands — the PURCHASE DEMANDS Register
 * (CARD-2026-08-20-purchase-demands; `docs/purchasing/MASTER.md` §3.1).
 *
 * One question: *what customer goods need buying, what already covers them, and
 * what must be fixed before they can be bought?*
 *
 * ── WHAT THIS ROUTE IS NOT ──────────────────────────────────────────────────
 *
 * It is READ-ONLY and it has no `Issue`. It stores no demand remainder, no
 * status and no queue. It does not build, price, approve or send a purchase
 * order — `SO Batch Purchase` remains the only door that issues one.
 *
 * ── ONE READ, TWO PROJECTIONS ───────────────────────────────────────────────
 *
 * `loadToOrder` (now in `lib/purchase-demand-read.ts`) is the SAME
 * recomputation `SO Batch Purchase` reads. Every quantity below is carried off
 * the engine's own build; the only thing this file composes is the STATE, and
 * that composition lives in `@carres/shared` so a screen cannot re-derive it.
 *
 * ── THE LINES THE ENGINE REFUSES ────────────────────────────────────────────
 *
 * A workspace that ISSUES may drop a line it cannot buy. A Register that
 * EXPLAINS may not — a row that is not there answers nothing. So the four
 * refusals the engine records (`registerFacts`) become rows here, each stating
 * the fix. Their coverage columns are `null`, deliberately: the fact that
 * blocks the purchase also blocks the allocation, so there is no coverage
 * answer, and a `0` would assert that nothing covers them — which is not known.
 */
const purchaseDemandsRouter = new Hono<AppEnv>();

/** Nobody resolved → the duty word stands (`work-engine.ts`'s own law). */
function ownerOf(
  state: PurchaseDemandState,
  name: string | null,
): { ownerName: string | null; ownerDuty: string | null } {
  const duty = PURCHASE_DEMAND_OWNER_DUTY[state];
  if (!duty) return { ownerName: null, ownerDuty: null };
  return name ? { ownerName: name, ownerDuty: null } : { ownerName: null, ownerDuty: duty };
}

purchaseDemandsRouter.get("/", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const res = await loadToOrder(sb);
  if (!res.ok) return c.json(res.body as Record<string, unknown>, res.status as 400);
  const { proposals, registerFacts, supplierNames, stockWarehouse, today } = res.data;

  /**
   * The two owner facts, read here because they are Register-only.
   *
   * `ops_po_duty` is read, never resolved: `resolveDutyMonth` lazily UPSERTS a
   * holder, and a Register read may not write. No row for this month → the duty
   * word stands, which is the honest answer anyway.
   *
   * Both reads fail soft. A name that cannot be resolved costs the chip, never
   * the page.
   */
  const salespersonIds = [
    ...new Set(
      [...registerFacts.ordersById.values()]
        .map((o) => o.salespersonId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  let poDutyName: string | null = null;
  const nameById = new Map<string, string>();
  try {
    const month = monthKeyMYT();
    const [duty, people] = await Promise.all([
      sb.from("ops_po_duty").select("user_id").eq("month", month).maybeSingle(),
      salespersonIds.length > 0
        ? sb.from("app_users").select("id, name, email").in("id", salespersonIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    ]);
    const label = (u: Record<string, unknown>): string =>
      ((u.name as string | null) ?? "").trim() || ((u.email as string | null) ?? "");
    for (const u of (people.data ?? []) as Record<string, unknown>[]) {
      const l = label(u);
      if (l) nameById.set(u.id as string, l);
    }
    const dutyId = (duty.data as { user_id?: string } | null)?.user_id ?? null;
    if (dutyId) {
      const holder = await sb
        .from("app_users")
        .select("id, name, email")
        .eq("id", dutyId)
        .maybeSingle();
      const h = holder.data as Record<string, unknown> | null;
      if (h) poDutyName = label(h) || null;
    }
  } catch (e) {
    console.error("purchase demands — owner names unavailable", (e as Error).message);
  }

  const orderFact = (orderId: string): RegisterOrderFact =>
    registerFacts.ordersById.get(orderId) ?? {
      so: null,
      customer: null,
      delivery: null,
      salespersonId: null,
    };

  const rows: PurchaseDemandRow[] = [];

  /* ── 1 · the demand the engine CARRIED ──────────────────────────────────── */
  for (const proposal of proposals) {
    for (const row of proposal.rows) {
      // A typed Ready Stock demand is not a CUSTOMER demand. It left this
      // engine with CARD-2026-08-18-manual-purchase and has its own page; the
      // guard costs nothing and keeps the boundary explicit.
      if (row.readyStock) continue;
      for (const build of row.builds) {
        const q = purchaseDemandQuantities(build, proposal.category);
        const state = purchaseDemandStateOf({
          inCatalog: true,
          hasSupplier: true,
          // A pair with no production days never reaches a proposal — the read
          // refuses it line by line and records it in `registerFacts` below.
          hasProductionDays: true,
          fullyCovered: build.fullyOnPo === true,
          hasCustomerDate: row.delivery != null,
        });
        const fact = orderFact(row.orderId);
        rows.push({
          id: `build::${row.orderId}::${build.key}`,
          state,
          lineIds: build.lines.map((l) => l.lineId),
          orderId: row.orderId,
          so: row.so,
          customer: row.customer,
          customerDelivery: row.delivery,
          item: build.model,
          // A modular sofa is a matched SET, not one variant — the engine gives
          // it no size, and its module codes are the SKUs below.
          variant: build.size,
          category: proposal.category,
          skus: build.codes ? build.codes.split(" · ") : [],
          supplierId: proposal.supplierId,
          supplier: proposal.supplierName,
          qtyNeeded: q.qtyNeeded,
          readyStock: q.readyStock,
          takenFromStock: q.takenFromStock,
          onPo: q.onPo,
          poNumbers: build.coveredByOpenPoPos,
          toBuy: q.toBuy,
          ...ownerOf(state, nameById.get(fact.salespersonId ?? "") ?? null),
        });
      }
    }
  }

  /* ── 2 · the demand the engine REFUSED ──────────────────────────────────── */
  for (const line of registerFacts.lines) {
    const fact = orderFact(line.orderId);
    const state = purchaseDemandStateOf({
      inCatalog: line.refusal !== "no_sku",
      hasSupplier: line.refusal !== "no_supplier",
      hasProductionDays: line.refusal !== "no_production_days",
      fullyCovered: line.refusal === "covered_by_stock",
      hasCustomerDate: fact.delivery != null,
    });
    const covered = line.refusal === "covered_by_stock";
    rows.push({
      id: `line::${line.lineId}`,
      state,
      lineIds: [line.lineId],
      orderId: line.orderId,
      so: fact.so,
      customer: fact.customer,
      customerDelivery: fact.delivery,
      item: line.modelName ?? line.sku,
      variant: line.variant,
      category: (line.category as ProductCategory | null) ?? null,
      skus: [line.sku],
      supplierId: line.supplierId,
      supplier: line.supplierId ? (supplierNames.get(line.supplierId) ?? null) : null,
      qtyNeeded: line.qty,
      // Covered by an already-drawn unit IS a counted answer; the three
      // refusals are not — see this file's header.
      readyStock: covered ? 0 : null,
      takenFromStock: covered ? line.takenFromStock : null,
      onPo: covered ? 0 : null,
      poNumbers: [],
      toBuy: covered ? 0 : null,
      ...ownerOf(
        state,
        state === "no_customer_date"
          ? (nameById.get(fact.salespersonId ?? "") ?? null)
          : poDutyName,
      ),
    });
  }

  const body: PurchaseDemandsResponse = { today, rows, stockWarehouse: stockWarehouse?.name ?? null };
  return c.json(body);
});

export default purchaseDemandsRouter;
