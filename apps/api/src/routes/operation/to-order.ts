import { Hono } from "hono";
import { z } from "zod";
import {
  buildToOrder,
  isToOrderCategory,
  myHolidaySet,
  planPurchaseOrders,
  productionWorkingDaysFor,
  workWeekOffDaysFor,
  type ProductCategory,
  type ToOrderLine,
  type ToOrderProposal,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { loadPurchasingSettings } from "../../lib/purchasing-settings";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/purchase/to-order — the Planning Workspace.
 *
 *   GET  /            the proposals the Review Grid shows
 *   POST /issue       the ONE act that creates formal purchase orders
 *
 * **Nothing here stores a proposal.** The read recomputes it every time, which
 * is the whole reason To Order has no status, no hold and no audit of its own.
 *
 * **The write goes through `operation_create_po`, the RPC that has always
 * created purchase orders.** No second write path is introduced and no
 * migration is needed: the destination is set with a follow-up UPDATE, which
 * `trg_po_destination_guard` already permits for operation/principal while a PO
 * has received nothing.
 *
 * userClient / RLS is the security boundary throughout — never service_role.
 */
const toOrderRouter = new Hono<AppEnv>();

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `attrs` is jsonb; read one string field defensively. */
function attr(attrs: unknown, key: string): string | null {
  if (!attrs || typeof attrs !== "object") return null;
  const v = (attrs as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

type Loaded = {
  proposals: ToOrderProposal[];
  today: string;
};

/**
 * Read live demand and project it. Shared by the GET and by the POST, so the
 * document that gets issued is built from the SAME computation the operator
 * reviewed — the client never posts rows back.
 */
async function loadToOrder(
  sb: ReturnType<typeof userClient>,
): Promise<{ ok: true; data: Loaded } | { ok: false; status: number; body: unknown }> {
  let settings;
  try {
    settings = await loadPurchasingSettings(sb);
  } catch (e) {
    return {
      ok: false,
      status: 500,
      body: {
        error: "settings_unavailable",
        code: "settings_unavailable",
        message: (e as Error).message,
      },
    };
  }

  const { data: orderRows, error: orderErr } = await sb
    .from("orders")
    .select(
      "id, so, customer_name, status, delivery_date, delivery_date_tbd, placed_at, created_at",
    )
    .in("status", ["place", "proceed_order"]);
  if (orderErr) {
    const m = mapPgError(orderErr);
    return { ok: false, status: m.status, body: m.body };
  }
  const orders = orderRows ?? [];
  const orderById = new Map(orders.map((o) => [o.id as string, o]));
  const orderIds = orders.map((o) => o.id as string);

  if (orderIds.length === 0) {
    return { ok: true, data: { proposals: [], today: todayIso() } };
  }

  const { data: lineRows, error: lineErr } = await sb
    .from("order_lines")
    .select("id, order_id, sku, qty, attrs, excluded_from_plan, exclude_from_plan_until")
    .in("order_id", orderIds);
  if (lineErr) {
    const m = mapPgError(lineErr);
    return { ok: false, status: m.status, body: m.body };
  }
  const lines = lineRows ?? [];
  const skus = [...new Set(lines.map((l) => l.sku as string))];

  // Catalog facts. No FK exists on order_lines.sku, so this is a second query
  // by sku rather than an embed (product_skus → product_models IS a real FK).
  const cat = new Map<
    string,
    {
      supplierId: string | null;
      cost: number | null;
      variant: string | null;
      category: string | undefined;
      modelName: string | null;
    }
  >();
  if (skus.length > 0) {
    const { data: skuRows, error: skuErr } = await sb
      .from("product_skus")
      .select("sku, supplier_id, cost, variant, product_models!inner(category, name)")
      .in("sku", skus);
    if (skuErr) {
      const m = mapPgError(skuErr);
      return { ok: false, status: m.status, body: m.body };
    }
    for (const s of skuRows ?? []) {
      const pm = (s as Record<string, unknown>).product_models as
        | { category?: string | null; name?: string | null }
        | null;
      cat.set(s.sku as string, {
        supplierId: (s.supplier_id as string | null) ?? null,
        cost: s.cost != null ? Number(s.cost) : null,
        variant: (s.variant as string | null) ?? null,
        category: (pm?.category as string | undefined) ?? undefined,
        modelName: (pm?.name as string | null) ?? null,
      });
    }
  }

  const { data: supRows, error: supErr } = await sb.from("suppliers").select("id, name");
  if (supErr) {
    const m = mapPgError(supErr);
    return { ok: false, status: m.status, body: m.body };
  }

  const demand: ToOrderLine[] = [];
  const missingProductionDays: { supplierId: string; category: string }[] = [];
  const seenMissing = new Set<string>();

  for (const l of lines) {
    const c = cat.get(l.sku as string);
    const category = c?.category;
    const supplierId = c?.supplierId ?? null;

    // POSITIVE rule: only the three made-to-order categories reach this page.
    // Accessories are replenished against a reorder point; a guarantee or a
    // service is not goods. Filtering on the category rather than on "the SKU
    // happens to have no supplier" is what stops a pillow appearing here the
    // day somebody maps one.
    if (!category || !isToOrderCategory(category) || !supplierId) continue;

    if ((l as { excluded_from_plan?: boolean }).excluded_from_plan === true) continue;
    const until = (l as { exclude_from_plan_until?: string | null }).exclude_from_plan_until;
    if (until && new Date(until) > new Date()) continue;

    const order = orderById.get(l.order_id as string);
    if (!order) continue;

    const leadDays = productionWorkingDaysFor(settings, supplierId, category as ProductCategory);
    if (leadDays == null) {
      const k = `${supplierId}::${category}`;
      if (!seenMissing.has(k)) {
        seenMissing.add(k);
        missingProductionDays.push({ supplierId, category });
      }
      continue;
    }

    const tbd = Boolean(order.delivery_date_tbd);
    const deadline = tbd ? null : ((order.delivery_date as string | null) ?? null);
    const placedAt = ((order.placed_at as string | null) ??
      (order.created_at as string | null) ??
      todayIso()) as string;
    const attrs = (l as { attrs?: unknown }).attrs;

    demand.push({
      lineId: l.id as string,
      orderId: l.order_id as string,
      sku: l.sku as string,
      category: category as ProductCategory,
      supplierId,
      qty: Number(l.qty ?? 0),
      deadline: deadline ? deadline.slice(0, 10) : null,
      leadDays,
      offDays: workWeekOffDaysFor(settings, supplierId),
      placedAt: placedAt.slice(0, 10),
      committed: order.status === "proceed_order",
      so: order.so != null ? Number(order.so) : null,
      customerName: (order.customer_name as string | null) ?? null,
      modelName: c?.modelName ?? null,
      variant: c?.variant ?? null,
      buildKey: attr(attrs, "sofa_build_key"),
      fabricName: attr(attrs, "fabric_name"),
      legHeight: attr(attrs, "leg_height"),
      itemHeight: attr(attrs, "sofa_height"),
      cost: c?.cost ?? null,
    });
  }

  // Supply: what open POs already cover. A line already on a PO has left this
  // workspace, so it must never appear as something still to buy.
  const demandSkus = [...new Set(demand.map((d) => d.sku))];
  const openPoBySku: Record<string, number> = {};
  if (demandSkus.length > 0) {
    const { data: poLines, error: poErr } = await sb
      .from("purchase_order_lines")
      .select("sku, qty, received_qty, purchase_orders!inner(status)")
      .in("sku", demandSkus)
      .eq("purchase_orders.status", "open");
    if (poErr) {
      const m = mapPgError(poErr);
      return { ok: false, status: m.status, body: m.body };
    }
    for (const r of poLines ?? []) {
      const remaining = Number(r.qty ?? 0) - Number(r.received_qty ?? 0);
      if (remaining <= 0) continue;
      const sku = r.sku as string;
      openPoBySku[sku] = (openPoBySku[sku] ?? 0) + remaining;
    }
  }

  const today = todayIso();
  const proposals = buildToOrder({
    lines: demand,
    suppliers: (supRows ?? []).map((s) => ({
      id: s.id as string,
      name: (s.name as string) ?? "",
    })),
    supply: { openPoBySku },
    options: {
      today,
      holidays: myHolidaySet(),
      // The arrival buffer and the urgency buckets count on the OFFICE week —
      // arranging a delivery is office work (Law 2A). The supplier's own week
      // rides on each line's offDays.
      offDays: [0, 6],
      arrivalBufferDays: settings.orderByBufferDays,
      reviewDaysBySupplier: {},
    },
    missingProductionDays,
  });

  return { ok: true, data: { proposals, today } };
}

toOrderRouter.get("/", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const res = await loadToOrder(sb);
  if (!res.ok) return c.json(res.body as Record<string, unknown>, res.status as 400);

  const { data: destRows, error: destErr } = await sb
    .from("purchasing_destinations")
    .select("id, name, is_default")
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("name");
  if (destErr) {
    const m = mapPgError(destErr);
    return c.json(m.body, m.status);
  }

  return c.json({
    today: res.data.today,
    proposals: res.data.proposals,
    destinations: (destRows ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
      isDefault: Boolean(d.is_default),
    })),
  });
});

const issueBody = z.object({
  supplierId: z.string().uuid(),
  category: z.string().min(1),
  destinationId: z.string().uuid(),
});

toOrderRouter.post("/issue", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = issueBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const { supplierId, category, destinationId } = parsed.data;

  // Recompute. The operator's screen is a view; what gets issued is built from
  // the server's own reading, so a stale tab cannot order last hour's demand.
  const res = await loadToOrder(sb);
  if (!res.ok) return c.json(res.body as Record<string, unknown>, res.status as 400);

  const proposal = res.data.proposals.find(
    (p) => p.supplierId === supplierId && p.category === category,
  );
  if (!proposal || proposal.rows.length === 0) {
    return c.json(
      { error: "nothing_to_issue", code: "nothing_to_issue" },
      409,
    );
  }
  if (proposal.blocked === "production_days") {
    return c.json(
      { error: "production_days_required", code: "production_days_required" },
      422,
    );
  }

  const { data: dest, error: destErr } = await sb
    .from("purchasing_destinations")
    .select("id, name")
    .eq("id", destinationId)
    .eq("active", true)
    .maybeSingle();
  if (destErr) {
    const m = mapPgError(destErr);
    return c.json(m.body, m.status);
  }
  if (!dest) return c.json({ error: "unknown_destination", code: "invalid_param" }, 422);

  // Carres holds exactly one warehouse; AL and HOUZS are delivery ADDRESSES and
  // never warehouse records, which is why the destination is its own column.
  const { data: whRows, error: whErr } = await sb
    .from("warehouses")
    .select("id, name, kind")
    .eq("kind", "own");
  if (whErr) {
    const m = mapPgError(whErr);
    return c.json(m.body, m.status);
  }
  const warehouses = whRows ?? [];
  const warehouse =
    warehouses.find((w) => /klang|klg/i.test((w.name as string) ?? "")) ?? warehouses[0];
  if (!warehouse) {
    return c.json({ error: "no_warehouse", code: "no_warehouse" }, 500);
  }

  const plan = planPurchaseOrders(proposal);
  const created: { id: string; customer: string }[] = [];

  for (const po of plan) {
    const { data, error } = await sb.rpc("operation_create_po", {
      p_supplier_id: po.supplierId,
      p_warehouse_id: warehouse.id as string,
      p_lines: po.lines.map((l) => ({
        sku: l.sku,
        qty: l.qty,
        // The purchase price is resolved from the catalog and never shown here
        // (Loo, 2026-07-30: the supplier has an agreed rate). The RPC requires
        // one, so an unpriced SKU writes 0 rather than blocking the purchase.
        cost: l.cost ?? 0,
        cost_source: "catalog",
      })),
      p_so: po.so,
      p_so_refs: po.soRefs.length > 0 ? po.soRefs : null,
    });
    if (error) {
      const m = mapPgError(error);
      return c.json(
        { ...(m.body as object), issued: created },
        m.status,
      );
    }
    const id = (data as { id?: string } | null)?.id;
    if (!id) {
      return c.json({ error: "po_not_created", code: "po_not_created", issued: created }, 500);
    }

    // Where the goods go. A fresh PO has received nothing, so the destination
    // guard permits this for operation/principal; it freezes on first receipt.
    const { error: upErr } = await sb
      .from("purchase_orders")
      .update({ destination_id: destinationId })
      .eq("id", id);
    if (upErr) {
      const m = mapPgError(upErr);
      return c.json({ ...(m.body as object), issued: created }, m.status);
    }

    created.push({ id, customer: po.customer });
  }

  return c.json({
    supplier: proposal.supplierName,
    destination: dest.name as string,
    pos: created,
  });
});

export default toOrderRouter;
