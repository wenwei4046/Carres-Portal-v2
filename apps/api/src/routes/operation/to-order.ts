import { Hono } from "hono";
import { z } from "zod";
import {
  buildToOrder,
  isToOrderCategory,
  myHolidaySet,
  planFromDocuments,
  productionWorkingDaysFor,
  railItemLabel,
  workWeekOffDaysFor,
  type ProductCategory,
  type IssueDocument,
  type ToOrderLine,
  type ToOrderOrderedRow,
  type ToOrderProposal,
} from "@carres/shared";
import { validateIssuePlan } from "@carres/shared";
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

/**
 * Split an `.in(…)` list into small batches.
 *
 * On 2026-07-30 seven customer requirements across five customer orders reached
 * no purchase order at all, and two whole customer orders disappeared from the
 * workspace. The projection was proved correct on the same data, every SKU
 * existed with the same supplier, the same category and the same production
 * time as the ones that DID get ordered, none was excluded and none was covered
 * — so the loss happened in the catalog read, and a `.in()` of 78 values with
 * quoted parentheses is the one thing between the demand and the plan.
 *
 * Chunking removes the whole class rather than one instance. The guard below
 * removes the rest: even if a read still comes back short, the demand is now
 * NAMED instead of skipped.
 */
const IN_CHUNK = 40;

function chunk<T>(xs: readonly T[], n = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** `attrs` is jsonb; read one string field defensively. */
function attr(attrs: unknown, key: string): string | null {
  if (!attrs || typeof attrs !== "object") return null;
  const v = (attrs as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

type Unresolved = { sku: string; orderId: string; so: number | null };

type CatalogFact = {
  supplierId: string | null;
  cost: number | null;
  variant: string | null;
  variantKind: string | null;
  category: string | undefined;
  modelName: string | null;
};

type Loaded = {
  proposals: ToOrderProposal[];
  today: string;
  /** Settings' PO Days — the rail's purchase calendar runs on it. */
  poDays: readonly number[];
  /** Demand the catalog could not answer for. Empty is the only healthy value. */
  unresolved: Unresolved[];
  /** The whole catalog, read once — the ordered read reuses it. */
  catalog: Map<string, CatalogFact>;
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
    return {
      ok: true,
      data: {
        proposals: [],
        today: todayIso(),
        poDays: settings.poDays,
        unresolved: [],
        catalog: new Map(),
      },
    };
  }

  const lines: Record<string, unknown>[] = [];
  for (const batch of chunk(orderIds)) {
    const { data, error } = await sb
      .from("order_lines")
      .select("id, order_id, sku, qty, attrs, excluded_from_plan, exclude_from_plan_until")
      .in("order_id", batch);
    if (error) {
      const m = mapPgError(error);
      return { ok: false, status: m.status, body: m.body };
    }
    lines.push(...((data ?? []) as Record<string, unknown>[]));
  }

  // Catalog facts. No FK exists on order_lines.sku, so this is a second query
  // by sku rather than an embed (product_skus → product_models IS a real FK).
  const cat = new Map<string, CatalogFact>();
  /**
   * ⚠ THE CATALOG IS READ WHOLE, AND `.in()` IS NEVER USED ON A SKU.
   *
   * `order_lines.sku` is free text, and 16 live demand lines carry a DOUBLE
   * QUOTE in the value — `Leg 4"`, `HK5531/28"(2 Seater + Lshape)/…`. PostgREST
   * wraps a value holding reserved characters in double quotes, so a value that
   * CONTAINS one breaks the filter it is put into and the server answers with
   * whatever it managed to parse.
   *
   * That is the whole story of this module's two worst days: seven customer
   * requirements on no purchase order (2026-07-30), then a guard reading the
   * short answer as an alarm and blocking every issue (2026-07-31). Chunking
   * did not help — the unparseable value is still inside one of the chunks.
   *
   * The catalog is 205 rows. Reading it whole costs nothing and removes the
   * class: no list to quote, no length to exceed, nothing to chunk. A SKU
   * absent from this map is then definitively not a product, so "does it
   * exist?" needs no second query.
   */
  const { data: skuRows, error: skuErr } = await sb
    .from("product_skus")
    .select(
      "sku, supplier_id, cost, variant, variant_kind, product_models!inner(category, name)",
    );
  if (skuErr) {
    const m = mapPgError(skuErr);
    return { ok: false, status: m.status, body: m.body };
  }
  for (const row of (skuRows ?? []) as Record<string, unknown>[]) {
    const pm = row.product_models as { category?: string | null; name?: string | null } | null;
    cat.set(row.sku as string, {
      supplierId: (row.supplier_id as string | null) ?? null,
      cost: row.cost != null ? Number(row.cost) : null,
      variant: (row.variant as string | null) ?? null,
      variantKind: (row.variant_kind as string | null) ?? null,
      category: (pm?.category as string | undefined) ?? undefined,
      modelName: (pm?.name as string | null) ?? null,
    });
  }

  const { data: supRows, error: supErr } = await sb.from("suppliers").select("id, name");
  if (supErr) {
    const m = mapPgError(supErr);
    return { ok: false, status: m.status, body: m.body };
  }

  const demand: ToOrderLine[] = [];
  const missingProductionDays: { supplierId: string; category: string }[] = [];
  const seenMissing = new Set<string>();
  /** Demand the catalog could not answer for. Never dropped in silence. */
  const unresolved: { sku: string; orderId: string; so: number | null }[] = [];

  for (const l of lines) {
    const c = cat.get(l.sku as string);

    // Not a catalog product — `Transport Fees`, `Leg 4"`, an AutoCount
    // description. 95 of them live here; never procurable, so nothing is said.
    // The map above is the WHOLE catalog, so this is a fact, not a failed read.
    if (!c) continue;

    const category = c.category;
    const supplierId = c.supplierId ?? null;

    // POSITIVE rule: only the three made-to-order categories reach this page.
    // Accessories are replenished against a reorder point; a guarantee or a
    // service is not goods. Filtering on the category rather than on "the SKU
    // happens to have no supplier" is what stops a pillow appearing here the
    // day somebody maps one.
    //
    // A SKU that resolved but carries no supplier is NOT silent either — it is
    // a real procurable item nobody has mapped, and the information model
    // (§6.3) forbids it disappearing.
    if (category && isToOrderCategory(category) && !supplierId) {
      unresolved.push({
        sku: l.sku as string,
        orderId: l.order_id as string,
        so: (orderById.get(l.order_id as string)?.so as number | null) ?? null,
      });
      continue;
    }
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
      variantKind: c?.variantKind ?? null,
      buildKey: attr(attrs, "sofa_build_key"),
      fabricName: attr(attrs, "fabric_name"),
      legHeight: attr(attrs, "leg_height"),
      itemHeight: attr(attrs, "sofa_height"),
      cost: c?.cost ?? null,
    });
  }

  // Supply: what open POs already cover. A line already on a PO has left this
  // workspace, so it must never appear as something still to buy.
  // Every OPEN purchase order line, unfiltered — same reason as the catalog: a
  // SKU may not go into an `.in()` list. Open POs are a small live slice.
  const openPoBySku: Record<string, number> = {};
  {
    const { data: poLines, error: poErr } = await sb
      .from("purchase_order_lines")
      .select("sku, qty, received_qty, purchase_orders!inner(status)")
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

  return { ok: true, data: { proposals, today, poDays: settings.poDays, unresolved, catalog: cat } };
}

/** How far back the grid answers "what did we order". Older → Purchase Orders. */
const ORDERED_WINDOW_DAYS = 14;

/**
 * Rows that already became purchase orders — the grid's `Ordered` answer
 * (Jess, 2026-08-01: Today + PO filter `Ordered` = 今天已经下了哪些).
 *
 * RECENT ONLY, on purpose: real history belongs to Purchase Orders, so this
 * reads the last {@link ORDERED_WINDOW_DAYS} days and nothing more. A row is
 * one PO × one customer order; its lines are matched by SKU against the
 * customer's own order lines, so the quantity is what THAT customer ordered —
 * the same voice as a demand row. A PO with no SO refs (a manual purchase)
 * still gets one row: it was ordered, and ordered work must be answerable.
 *
 * Failures here degrade to an empty list rather than failing the page — the
 * demand half is the work; the ordered half is the receipt.
 */
async function loadOrderedRows(
  sb: ReturnType<typeof userClient>,
  today: string,
  catalog: Map<string, CatalogFact>,
): Promise<ToOrderOrderedRow[]> {
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - ORDERED_WINDOW_DAYS);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data: poRows, error: poErr } = await sb
    .from("purchase_orders")
    .select("id, supplier_id, placed_at, so_refs")
    .gte("placed_at", sinceIso)
    .order("placed_at", { ascending: false });
  if (poErr || !poRows || poRows.length === 0) return [];

  // The catalog arrives from loadToOrder — but its no-open-orders early
  // return carries an EMPTY map, and recent POs can outlive their orders.
  // Read it here in that one case, whole, same rule as loadToOrder (§: a SKU
  // never goes into an `.in()`).
  if (catalog.size === 0) {
    const { data: skuRows } = await sb
      .from("product_skus")
      .select("sku, supplier_id, cost, variant, variant_kind, product_models!inner(category, name)");
    for (const row of (skuRows ?? []) as Record<string, unknown>[]) {
      const pm = row.product_models as { category?: string | null; name?: string | null } | null;
      catalog.set(row.sku as string, {
        supplierId: (row.supplier_id as string | null) ?? null,
        cost: row.cost != null ? Number(row.cost) : null,
        variant: (row.variant as string | null) ?? null,
        variantKind: (row.variant_kind as string | null) ?? null,
        category: (pm?.category as string | undefined) ?? undefined,
        modelName: (pm?.name as string | null) ?? null,
      });
    }
  }

  const poIds = poRows.map((p) => p.id as string);
  const linesByPo = new Map<string, { sku: string; qty: number }[]>();
  for (const batch of chunk(poIds)) {
    const { data, error } = await sb
      .from("purchase_order_lines")
      .select("po_id, sku, qty")
      .in("po_id", batch);
    if (error) return [];
    for (const l of data ?? []) {
      const arr = linesByPo.get(l.po_id as string) ?? [];
      arr.push({ sku: l.sku as string, qty: Number(l.qty ?? 0) });
      linesByPo.set(l.po_id as string, arr);
    }
  }

  const soRefs = [...new Set(poRows.flatMap((p) => (p.so_refs as number[] | null) ?? []))];
  const orderBySo = new Map<number, Record<string, unknown>>();
  const orderLinesByOrder = new Map<string, { sku: string; qty: number; attrs: unknown }[]>();
  if (soRefs.length > 0) {
    for (const batch of chunk(soRefs)) {
      const { data, error } = await sb
        .from("orders")
        .select("id, so, customer_name, delivery_date, delivery_date_tbd")
        .in("so", batch);
      if (error) return [];
      for (const o of data ?? []) orderBySo.set(Number(o.so), o as Record<string, unknown>);
    }
    const orderIds = [...orderBySo.values()].map((o) => o.id as string);
    for (const batch of chunk(orderIds)) {
      const { data, error } = await sb
        .from("order_lines")
        .select("order_id, sku, qty, attrs")
        .in("order_id", batch);
      if (error) return [];
      for (const l of data ?? []) {
        const arr = orderLinesByOrder.get(l.order_id as string) ?? [];
        arr.push({ sku: l.sku as string, qty: Number(l.qty ?? 0), attrs: l.attrs });
        orderLinesByOrder.set(l.order_id as string, arr);
      }
    }
  }

  /** One build, one MODEL NAME — `2 items` is banned from the Model column
   *  (Jess, 2026-08-01), so ordered rows split exactly like demand rows. */
  const labelOf = (sku: string): string => {
    const f = catalog.get(sku);
    const size = f?.variantKind === "size" ? f.variant : null;
    return railItemLabel(f?.modelName ?? sku, size);
  };
  const categoryOf = (skus: readonly string[]): ProductCategory | null => {
    for (const s of skus) {
      const c = catalog.get(s)?.category;
      if (c && isToOrderCategory(c)) return c;
    }
    return null;
  };

  const rows: ToOrderOrderedRow[] = [];
  for (const po of poRows) {
    const poLines = linesByPo.get(po.id as string) ?? [];
    const poSkus = new Set(poLines.map((l) => l.sku));
    const refs = (po.so_refs as number[] | null) ?? [];
    const placedAt = ((po.placed_at as string | null) ?? today).slice(0, 10);
    const category = categoryOf([...poSkus]);
    if (!category) continue; // not this page's goods (accessory restock etc.)

    if (refs.length === 0) {
      // A manual PO: one row per LINE, each naming its model.
      for (const l of poLines) {
        rows.push({
          poId: po.id as string,
          placedAt,
          category,
          supplierId: (po.supplier_id as string | null) ?? "",
          orderId: null,
          customer: null,
          so: null,
          delivery: null,
          model: labelOf(l.sku),
          qty: l.qty,
        });
      }
      continue;
    }

    for (const so of refs) {
      const order = orderBySo.get(Number(so));
      const covered = order
        ? (orderLinesByOrder.get(order.id as string) ?? []).filter((l) => poSkus.has(l.sku))
        : [];
      const tbd = Boolean(order?.delivery_date_tbd);
      const base = {
        poId: po.id as string,
        placedAt,
        category,
        supplierId: (po.supplier_id as string | null) ?? "",
        orderId: (order?.id as string | null) ?? null,
        customer: (order?.customer_name as string | null) ?? null,
        so: Number(so),
        delivery:
          !tbd && order?.delivery_date
            ? (order.delivery_date as string).slice(0, 10)
            : null,
      };
      if (covered.length === 0) {
        // Nothing matched — still one honest row per PO line.
        for (const l of poLines) rows.push({ ...base, model: labelOf(l.sku), qty: l.qty });
        continue;
      }
      // One row per BUILD — a sofa's modules collapse to one sofa; every
      // other line stands alone, exactly the demand grid's grouping.
      const byBuild = new Map<string, { sku: string; qty: number }[]>();
      for (const l of covered) {
        const k = attr(l.attrs, "sofa_build_key") ?? `line::${l.sku}`;
        const arr = byBuild.get(k) ?? [];
        arr.push({ sku: l.sku, qty: l.qty });
        byBuild.set(k, arr);
      }
      for (const members of byBuild.values()) {
        rows.push({
          ...base,
          model: labelOf(members[0]!.sku),
          qty:
            category === "sofa" ? 1 : members.reduce((sum, m) => sum + m.qty, 0),
        });
      }
    }
  }
  return rows;
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

  const ordered = await loadOrderedRows(sb, res.data.today, res.data.catalog);

  return c.json({
    today: res.data.today,
    poDays: res.data.poDays,
    proposals: res.data.proposals,
    unresolved: res.data.unresolved,
    ordered,
    destinations: (destRows ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
      isDefault: Boolean(d.is_default),
    })),
  });
});

/**
 * The issue contract.
 *
 * The client posts an ARRANGEMENT — which builds go on which document — and
 * nothing else. Quantities, SKUs and prices are never sent: the server reads
 * them from its own recomputation, so a browser cannot invent a line, change a
 * quantity or price a purchase order.
 */
const issueBody = z.object({
  supplierId: z.string().uuid(),
  category: z.string().min(1),
  destinationId: z.string().uuid(),
  purchaseOrders: z
    .array(
      z.object({
        key: z.string().min(1),
        include: z.boolean(),
        buildKeys: z.array(z.string().min(1)),
      }),
    )
    .min(1)
    .max(200),
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
  const { supplierId, category, destinationId, purchaseOrders } = parsed.data;

  // Recompute. The operator's screen is a view; what gets issued is built from
  // the server's own reading, so a stale tab cannot order last hour's demand.
  const res = await loadToOrder(sb);
  if (!res.ok) return c.json(res.body as Record<string, unknown>, res.status as 400);

  // A requirement the catalog could not answer for could belong to ANY supplier
  // — nothing about it is known, including whose it is. So it stops every
  // issue, not just this supplier's: a purchase order that quietly omits a
  // customer's goods is worse than one that was never raised, because from that
  // point on nothing downstream is looking for them.
  if (res.data.unresolved.length > 0) {
    return c.json(
      {
        error: "demand_unresolved",
        code: "demand_unresolved",
        message: `${res.data.unresolved.length} customer requirement(s) could not be read from the catalog. Nothing was issued.`,
        unresolved: res.data.unresolved,
      },
      409,
    );
  }

  const proposal = res.data.proposals.find(
    (p) => p.supplierId === supplierId && p.category === category,
  );
  if (!proposal || proposal.rows.length === 0) {
    return c.json({ error: "nothing_to_issue", code: "nothing_to_issue" }, 409);
  }
  if (proposal.blocked === "production_days") {
    return c.json(
      { error: "production_days_required", code: "production_days_required" },
      422,
    );
  }

  // THE GATE. Every rule is asked against the proposal the server just built,
  // never against what the client believes:
  //   · a build already on a purchase order is not in it, so naming one fails
  //   · a build belonging to another supplier or category is not in it either
  //   · the same build twice, an empty document, a merged sofa and a batch past
  //     the transaction's cap each have their own refusal
  //   · demand that changed or was cancelled since the page loaded is simply
  //     absent from the recomputation, and fails as `unknown_build`
  const docs: IssueDocument[] = purchaseOrders.map((d) => ({
    key: d.key,
    include: d.include,
    buildKeys: d.buildKeys,
  }));
  const check = validateIssuePlan(proposal, docs);
  if (!check.ok) {
    return c.json({ error: check.code, code: check.code, message: check.message }, 422);
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

  const plan = planFromDocuments(proposal, docs);

  // ONE transaction. `operation_create_pos_batch` is a single plpgsql function,
  // so a failure on the seventh document rolls the first six back — there is no
  // state where half an issue exists and nothing says so.
  const { data: batch, error: batchErr } = await sb.rpc("operation_create_pos_batch", {
    p_pos: plan.map((po) => ({
      supplier_id: po.supplierId,
      warehouse_id: warehouse.id as string,
      so_refs: po.soRefs,
      lines: po.lines.map((l) => ({
        sku: l.sku,
        qty: l.qty,
        // The purchase price is resolved from the catalog and never shown here
        // (Loo, 2026-07-30: the supplier has an agreed rate). The RPC requires
        // one, so an unpriced SKU writes 0 rather than blocking the purchase.
        cost: l.cost ?? 0,
        cost_source: "catalog",
      })),
    })),
  });
  if (batchErr) {
    const m = mapPgError(batchErr);
    return c.json(m.body, m.status);
  }
  const ids = ((batch as { po_ids?: unknown } | null)?.po_ids ?? []) as string[];
  if (ids.length !== plan.length) {
    return c.json({ error: "po_not_created", code: "po_not_created" }, 500);
  }

  // Where the goods go, in ONE statement over every document the batch made. A
  // fresh purchase order has received nothing, so the destination guard permits
  // it; it freezes on first receipt.
  const { error: upErr } = await sb
    .from("purchase_orders")
    .update({ destination_id: destinationId })
    .in("id", ids);
  if (upErr) {
    const m = mapPgError(upErr);
    return c.json({ ...(m.body as object), issued: ids }, m.status);
  }

  return c.json({
    supplier: proposal.supplierName,
    destination: dest.name as string,
    pos: ids.map((id, i) => ({ id, customer: plan[i]?.customer ?? proposal.supplierName })),
  });
});

export default toOrderRouter;
