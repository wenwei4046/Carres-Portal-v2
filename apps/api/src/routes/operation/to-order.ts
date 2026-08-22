import { Hono } from "hono";
import { z } from "zod";
import {
  DEMAND_PURPOSE_DEFAULT,
  DEMAND_PURPOSE_VALUES,
  expectedArrivalOf,
  isOnePoPerOrder,
  isToOrderCategory,
  monthKeyMYT,
  planFromDocuments,
  readyStockDrawNote,
  READY_STOCK_DRAW_REASON,
  stockMatchKey,
  toOrderBuilds,
  railItemLabel,
  type DemandPickItem,
  type ProductCategory,
  type IssueDocument,
  type ToOrderBuild,
  type ToOrderOrderedRow,
  type ToOrderRow,
} from "@carres/shared";
import { validateIssuePlan } from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import {
  attr,
  chunk,
  loadToOrder,
  readFreeStock,
  stockRefOf,
  todayIso,
  type CatalogFact,
} from "../../lib/purchase-demand-read";
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
 *
 * ── THE READ MOVED OUT (CARD-2026-08-20-purchase-demands) ───────────────────
 *
 * `loadToOrder` and its private read helpers now live in
 * `lib/purchase-demand-read.ts`, because the `Purchase Demands` Register reads
 * the SAME recomputation. Not one line of the arithmetic changed and this
 * response is byte-identical; what moved is WHERE the function is declared, so
 * that two surfaces cannot grow two demand engines.
 */
const toOrderRouter = new Hono<AppEnv>();


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
  supplierNames: ReadonlyMap<string, string>,
  scopeSo: number | null = null,
): Promise<ToOrderOrderedRow[]> {
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - ORDERED_WINDOW_DAYS);
  const sinceIso = since.toISOString().slice(0, 10);

  let poQuery = sb
    .from("purchase_orders")
    .select("id, supplier_id, placed_at, so_refs");
  // A scoped entrance must explain an older PO too. The ordinary workspace
  // deliberately keeps its 14-day receipt window; only the explicit SO lens
  // asks history for that one order.
  if (scopeSo == null) poQuery = poQuery.gte("placed_at", sinceIso);
  const { data: allPoRows, error: poErr } = await poQuery.order("placed_at", {
    ascending: false,
  });
  const poRows =
    scopeSo == null
      ? allPoRows
      : (allPoRows ?? []).filter((p) =>
          ((p.so_refs as number[] | null) ?? []).some((so) => Number(so) === scopeSo),
        );
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
        .select("id, so, customer_name, delivery_date, delivery_date_tbd, proceed_date")
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
          supplierName: supplierNames.get((po.supplier_id as string | null) ?? "") ?? null,
          orderId: null,
          customer: null,
          so: null,
          delivery: null,
          // P18 — a manual purchase order has no customer order behind it, so
          // there is no planned production start to state. Null for the same
          // reason `so`, `customer` and `delivery` above are null.
          proceedDate: null,
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
        supplierName: supplierNames.get((po.supplier_id as string | null) ?? "") ?? null,
        orderId: (order?.id as string | null) ?? null,
        customer: (order?.customer_name as string | null) ?? null,
        so: Number(so),
        delivery:
          !tbd && order?.delivery_date
            ? (order.delivery_date as string).slice(0, 10)
            : null,
        // P18 — the same order fact on the receipt row. Required, not tidy: an
        // order whose every line is bought has no demand rows left, so its group
        // is receipts alone and this is the only place the header could read it.
        proceedDate: ((order?.proceed_date as string | null) ?? null)?.slice(0, 10) ?? null,
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
  const rawSo = c.req.query("so");
  const scopeSo = rawSo == null || rawSo === "" ? null : Number(rawSo);
  if (scopeSo != null && (!Number.isInteger(scopeSo) || scopeSo <= 0)) {
    return c.json({ error: "invalid_so", code: "invalid_param" }, 400);
  }
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

  // The factory names, read here rather than threaded out of loadToOrder: its
  // no-live-orders early return never reads `suppliers`, and an ordered row's
  // supplier is exactly the one that may have no demand today. 10 rows.
  const { data: supRows, error: supErr } = await sb.from("suppliers").select("id, name, kind");
  if (supErr) {
    const m = mapPgError(supErr);
    return c.json(m.body, m.status);
  }
  const supplierNames = new Map<string, string>(
    (supRows ?? []).map((s) => [s.id as string, (s.name as string) ?? ""]),
  );
  const { data: partnerRows, error: partnerErr } = await sb
    .from("delivery_partners")
    .select("id, name")
    .order("name");
  if (partnerErr) {
    const m = mapPgError(partnerErr);
    return c.json(m.body, m.status);
  }

  const ordered = await loadOrderedRows(
    sb,
    res.data.today,
    res.data.catalog,
    supplierNames,
    scopeSo,
  );

  // Scope AFTER the full recomputation. Stock and open-PO allocation therefore
  // stay global and authoritative; `?so=` is only a lens over that answer.
  const proposals =
    scopeSo == null
      ? res.data.proposals
      : res.data.proposals
          .map((proposal) => ({
            ...proposal,
            rows: proposal.rows.filter((row) => row.so === scopeSo),
          }))
          .filter((proposal) => proposal.rows.length > 0);
  const unresolved =
    scopeSo == null
      ? res.data.unresolved
      : res.data.unresolved.filter((row) => row.so === scopeSo);
  const scopedOrdered =
    scopeSo == null ? ordered : ordered.filter((row) => row.so === scopeSo);

  // Card 2's blocked-demand read model is deliberately demand-local. Pickup
  // partner is NOT represented here: it is a fact of the governed Issue
  // document after supplier/document construction.
  const blockedDemand: {
    code: "blocked_delivery_date" | "unresolved_supplier" | "cost_required";
    orderId: string;
    so: number | null;
    sku: string;
  }[] = unresolved.map((row) => ({ code: "unresolved_supplier", ...row }));
  for (const proposal of proposals) {
    for (const row of proposal.rows) {
      for (const build of row.builds) {
        if (build.fullyOnPo) continue;
        for (const line of build.lines) {
          if (!row.readyStock && row.delivery == null) {
            blockedDemand.push({
              code: "blocked_delivery_date",
              orderId: row.orderId,
              so: row.so,
              sku: line.sku,
            });
          }
          if (line.cost == null || line.cost <= 0) {
            blockedDemand.push({
              code: "cost_required",
              orderId: row.orderId,
              so: row.so,
              sku: line.sku,
            });
          }
        }
      }
    }
  }

  let scope: null | {
    so: number;
    orderFound: boolean;
    issuable: number;
    blockedProductionDays: number;
    blockedDeliveryDate: number;
    unresolved: number;
    alreadyCovered: number;
    alreadyIssued: number;
  } = null;
  if (scopeSo != null) {
    const { data: order } = await sb
      .from("orders")
      .select("id, proceed_date")
      .eq("so", scopeSo)
      .maybeSingle();
    let issuable = 0;
    let blockedProductionDays = res.data.blocked.filter((row) => row.so === scopeSo).length;
    let blockedDeliveryDate = 0;
    let alreadyCovered = 0;
    for (const proposal of proposals) {
      for (const row of proposal.rows) {
        for (const build of row.builds) {
          if (build.fullyOnPo) alreadyCovered += 1;
          else if (proposal.blocked === "production_days") blockedProductionDays += 1;
          else if (row.delivery == null) blockedDeliveryDate += 1;
          else issuable += 1;
        }
      }
    }
    scope = {
      so: scopeSo,
      orderFound: order != null,
      issuable,
      blockedProductionDays,
      blockedDeliveryDate,
      unresolved: unresolved.length,
      alreadyCovered,
      alreadyIssued: scopedOrdered.length,
    };
  }

  return c.json({
    today: res.data.today,
    poDays: res.data.poDays,
    proposals,
    unresolved,
    blockedDemand,
    ordered: scopedOrdered,
    ...(scope ? { scope } : {}),
    // P10 — the warehouse the offer was counted at, by its own name. The page
    // states WHERE the stock is, and it may not invent the word `Klang`: a
    // second warehouse is a rename away, and a sentence naming the wrong shed
    // is worse than one naming none.
    stockWarehouse: res.data.stockWarehouse?.name ?? null,
    destinations: (destRows ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
      isDefault: Boolean(d.is_default),
    })),
    procurementPartners: (partnerRows ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
    })),
  });
});

/**
 * The issue contract.
 *
 * The client posts an ARRANGEMENT plus governed transaction-cost/commercial
 * decisions and, for factory-pickup documents, one procurement partner.
 * Quantities and demand lines still come only from server recomputation. A
 * posted SKU must belong to that recomputed document, catalog-seeded prices
 * must still match, and the creation RPC repeats the commercial/partner laws.
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
        procurementPartnerId: z.string().uuid().optional(),
        lineDecisions: z
          .array(
            z.discriminatedUnion("treatment", [
              z.object({
                sku: z.string().min(1),
                treatment: z.literal("normal"),
                unitCost: z.number().positive(),
                costSource: z.enum(["catalog", "hand_entered"]),
              }),
              z.object({
                sku: z.string().min(1),
                treatment: z.literal("free_of_charge"),
                reason: z.string().trim().min(1).max(500),
              }),
            ]),
          )
          .max(500)
          .optional(),
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

  // An undated Customer Order remains visible, but cannot enter an Issue
  // document. Ready Stock is deliberately exempt.
  const blockedDateBuilds = new Set(
    proposal.rows
      .filter((row) => row.delivery == null && !row.readyStock)
      .flatMap((row) => row.builds.map((build) => build.key)),
  );
  if (
    purchaseOrders.some(
      (doc) => doc.include && doc.buildKeys.some((key) => blockedDateBuilds.has(key)),
    )
  ) {
    return c.json(
      {
        error: "blocked_delivery_date",
        code: "blocked_delivery_date",
        message: "Customer delivery date must be confirmed before Issue PO.",
      },
      422,
    );
  }
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

  const supplierKind = res.data.supplierKinds.get(supplierId) ?? null;
  if (!supplierKind) {
    return c.json({ error: "unresolved_supplier", code: "unresolved_supplier" }, 422);
  }
  const needsPartner = supplierKind === "factory_pickup";
  let validPartners = new Set<string>();
  if (needsPartner) {
    const { data: partners, error: partnersErr } = await sb
      .from("delivery_partners")
      .select("id");
    if (partnersErr) {
      const m = mapPgError(partnersErr);
      return c.json(m.body, m.status);
    }
    validPartners = new Set((partners ?? []).map((p) => p.id as string));
  }

  // Same frozen ETA arithmetic as before Card 2. It is now passed into the
  // governed transaction so PO creation, destination and ETA converge or roll
  // back together; neither the rule nor its inputs changed.
  const etaDate = expectedArrivalOf(res.data.settings, {
    supplierId,
    category,
    fromIso: todayIso(),
  });

  const governedPos: Record<string, unknown>[] = [];
  const activeDocs = purchaseOrders.filter((doc) => doc.include);
  for (let index = 0; index < plan.length; index += 1) {
    const po = plan[index];
    const doc = activeDocs[index];
    const partnerId = doc?.procurementPartnerId ?? null;
    if (needsPartner && (!partnerId || !validPartners.has(partnerId))) {
      return c.json(
        {
          error: "pickup_partner_required",
          code: "pickup_partner_required",
          documentKey: doc?.key,
          message: "Select a procurement partner for this factory-pickup PO.",
        },
        422,
      );
    }
    if (!needsPartner && partnerId) {
      return c.json(
        { error: "pickup_partner_not_allowed", code: "pickup_partner_not_allowed" },
        422,
      );
    }

    type LineDecision = NonNullable<(typeof purchaseOrders)[number]["lineDecisions"]>[number];
    const decisions = new Map<string, LineDecision>();
    for (const decision of doc?.lineDecisions ?? []) {
      if (decisions.has(decision.sku)) {
        return c.json({ error: "duplicate_cost_decision", code: "duplicate_cost_decision" }, 422);
      }
      decisions.set(decision.sku, decision);
    }
    const lineSkus = new Set(po.lines.map((line) => line.sku));
    if ([...decisions.keys()].some((sku) => !lineSkus.has(sku))) {
      return c.json({ error: "stale_cost_decision", code: "stale_cost_decision" }, 409);
    }

    const lines: Record<string, unknown>[] = [];
    for (const line of po.lines) {
      const decision = decisions.get(line.sku);
      if (decision?.treatment === "free_of_charge") {
        lines.push({
          sku: line.sku,
          qty: line.qty,
          cost: 0,
          cost_source: "hand_entered",
          commercial_treatment: "free_of_charge",
          commercial_reason: decision.reason.trim(),
        });
        continue;
      }
      if (decision?.treatment === "normal") {
        const liveCost = res.data.catalog.get(line.sku)?.cost ?? null;
        if (decision.costSource === "catalog" && liveCost !== decision.unitCost) {
          return c.json(
            { error: "stale_catalog_cost", code: "stale_catalog_cost", sku: line.sku },
            409,
          );
        }
        lines.push({
          sku: line.sku,
          qty: line.qty,
          cost: decision.unitCost,
          cost_source: decision.costSource,
          commercial_treatment: "normal",
          commercial_reason: null,
        });
        continue;
      }
      const liveCost = res.data.catalog.get(line.sku)?.cost ?? null;
      if (liveCost == null || liveCost <= 0) {
        return c.json(
          {
            error: "cost_required",
            code: "cost_required",
            documentKey: doc?.key,
            sku: line.sku,
            message: "Transaction cost or Free of Charge is required before Issue PO.",
          },
          422,
        );
      }
      lines.push({
        sku: line.sku,
        qty: line.qty,
        cost: liveCost,
        cost_source: "catalog",
        commercial_treatment: "normal",
        commercial_reason: null,
      });
    }
    governedPos.push({
      supplier_id: po.supplierId,
      warehouse_id: warehouse.id as string,
      destination_id: destinationId,
      eta_date: etaDate,
      procurement_partner_id: partnerId,
      so_refs: po.soRefs,
      lines,
    });
  }

  // ONE transaction. A failure on the seventh document rolls back the first
  // six, including commercial decisions, destination, ETA and audit history.
  const { data: batch, error: batchErr } = await sb.rpc("purchasing_issue_pos_batch", {
    p_pos: governedPos,
  });
  if (batchErr) {
    const m = mapPgError(batchErr);
    return c.json(m.body, m.status);
  }
  const ids = ((batch as { po_ids?: unknown } | null)?.po_ids ?? []) as string[];
  if (ids.length !== plan.length) {
    return c.json({ error: "po_not_created", code: "po_not_created" }, 500);
  }

  /**
   * THE PO'S BIRTH CERTIFICATE (Loo, 2026-08-03).
   *
   * A purchase order must be born carrying what the rest of the module reads.
   * `purchasing_record_tomorrow_delivery` (0306, shipped) refuses to open when
   * `eta_date` is NULL — so until this stamp existed, a built and deployed
   * supplier call could never fire on a PO raised here.
   *
   *   expected arrival = today
   *                    + production working days  (on the FACTORY's week)
   *                    + transit working days     (on the OFFICE week — moving
   *                                                goods is arranged by us)
   *
   * **THE ARITHMETIC ITSELF LIVES IN `expectedArrivalOf` AND NOWHERE ELSE**
   * (Loo, 2026-08-05). It was written a second time on the register, without
   * the transit leg, and the register therefore under-warned by exactly the day
   * it forgot on three live rows. This call and the register's now read the
   * same function; only `fromIso` differs, because a PO being born starts its
   * clock today and one already issued starts it at `placed_at`.
   *
   * It is stamped ONCE and then frozen: §2 — "a PO already sent is never
   * re-computed", because its dates were true when it was sent and moving them
   * would rewrite a promise the supplier already made.
   *
   * **AND IT IS OUR ESTIMATE, WHICH THE REGISTER NOW SAYS OUT LOUD.** Stamping
   * it here is deliberate and stays: 0306 refuses to open the tomorrow call on
   * a NULL arrival, so removing the stamp would take a shipped supplier call
   * dark. What was wrong was downstream — the register read *"a date exists"*
   * as *"the factory promised"*. Provenance now comes from
   * `po_supplier_promises`, so this stamp can be honest without being silent.
   *
   * `expected_ready_date` is deliberately NOT written here. That column is the
   * factory's PROMISE and R5 grades the factory by it; seeding it with our own
   * estimate would score a supplier on a number it never gave. Empty is not
   * missing data — it is the trigger of `Confirm ready date` (§3).
   *
   * A supplier with no transit number gets NO arrival rather than a guessed
   * one (P1's law), and the purchase order is still raised — the goods matter
   * more than the estimate, and the gap is visible as an empty arrival.
   */
  /**
   * A READY STOCK DEMAND THAT JUST BECAME A PURCHASE ORDER STOPS BEING DEMAND —
   * BY THE QUANTITY THAT WAS ORDERED, not all of it (0320, Loo 2026-08-04).
   *
   * The table carries no status column on purpose (Jess, 2026-08-01): open /
   * ordered / done are DERIVED. What the issue path owes a demand is the
   * NUMBER it took; without it the row sits on To Order for ever and gets
   * ordered twice.
   *
   * IT GOES THROUGH THE RPC, and that is 0316's rule applied to this table:
   * a quantity a client can PATCH is a quantity that moves with no arithmetic
   * and no guard. `purchasing_demand_record_issue` adds rather than sets (two
   * documents taking from one demand must add up), takes the row FOR UPDATE
   * (two operators pressing Issue in the same second queue instead of both
   * reading the same `issued_qty`), and refuses an over-issue by name — with
   * the table's own CHECK behind it in case a second door is ever written.
   *
   * The map is EXACT rather than by supplier: each document names the builds it
   * carried, and a build knows its `orderId`, which for a ready stock demand is
   * `demand:<uuid>`. So a demand is credited to the purchase order that
   * actually took it, never to "one of today's".
   */
  const buildRef = new Map(toOrderBuilds(proposal).map((b) => [b.buildKey, b]));
  const included = docs.filter((d) => d.include && d.buildKeys.length > 0);
  for (const [i, d] of included.entries()) {
    const poId = ids[i];
    if (!poId) continue;
    for (const k of d.buildKeys) {
      const ref = buildRef.get(k);
      const m = /^demand:(.+)$/.exec(ref?.orderId ?? "");
      if (!m) continue;
      const { error: stampErr } = await sb.rpc("purchasing_demand_record_issue", {
        p_id: m[1]!,
        p_qty: ref?.qty ?? 0,
        p_po_id: poId,
      });
      if (stampErr) {
        // The purchase orders exist and the supplier is about to be sent them.
        // Failing the whole issue now would destroy real work to protect a
        // number; the demand reappearing is visible and recoverable, and an
        // over-issue refusal is exactly the double-order this names out loud.
        console.error("purchase_demands issue record failed", m[1], stampErr.message);
      }
    }
  }

  /**
   * WHO RAISED IT. Measured 2026-08-01: `operation_create_pos_batch` writes no
   * audit row of any kind, so a purchase order could not say who issued it or
   * when. `po_history` has existed since 0001 for exactly this, so nothing new
   * is invented and no migration is needed.
   *
   * Best-effort ON PURPOSE: the purchase orders already exist and the supplier
   * is about to be sent them. Failing the whole issue because a history line
   * could not be written would destroy real work to protect a note about it.
   */
  await sb.from("po_history").insert(
    ids.map((id, i) => ({
      po_id: id,
      text: `Issued from To Order · ${plan[i]?.lines.length ?? 0} line(s)${
        etaDate ? ` · expected arrival ${etaDate}` : " · no expected arrival (transit days not set)"
      }`,
    })),
  );

  return c.json({
    supplier: proposal.supplierName,
    destination: dest.name as string,
    pos: ids.map((id, i) => ({ id, customer: plan[i]?.customer ?? proposal.supplierName })),
  });
});

/**
 * `Reserve` — ready stock is SUGGESTED; the human decides whether to reserve
 * it (card P10, Loo 2026-08-04; the word is P13's, same day — the goods do not
 * leave, they are LOCKED until delivery, and the order drawer's picker has
 * said `Reserve` for this act since 2026-06-30).
 *
 * THE ROUTE PATH STAYS `/take-stock`. It is a wire contract, not a word on a
 * screen, and renaming it would break a browser open across the deploy for
 * nothing. P13 rules the VOCABULARY the operator reads.
 *
 * THE BODY CARRIES NO QUANTITY, and that is his ruling 3 built as a contract
 * rather than as a screen rule: *"我要的就是有一个自动建议补货，不过我们可以
 * 手动选择要不要拉。"* The system suggests, the human accepts — so there is
 * nothing to type, nothing to mistype, and the REASON is recorded by
 * construction, because pressing this can mean exactly one thing.
 *
 * The server recomputes the whole workspace and reads the offer off its OWN
 * projection, so a stale tab cannot take stock against last hour's demand and
 * a browser cannot name a quantity, a SKU or a unit.
 */
const takeStockBody = z.object({
  orderId: z.string().min(1),
  buildKey: z.string().min(1),
});

toOrderRouter.post("/take-stock", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = takeStockBody.safeParse(raw);
  if (!parsed.success) return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  const { orderId, buildKey } = parsed.data;

  const res = await loadToOrder(sb);
  if (!res.ok) return c.json(res.body as Record<string, unknown>, res.status as 400);

  let found: { row: ToOrderRow; build: ToOrderBuild } | null = null;
  for (const p of res.data.proposals) {
    for (const row of p.rows) {
      if (row.orderId !== orderId) continue;
      const build = row.builds.find((b) => b.key === buildKey);
      if (build) found = { row, build };
    }
  }
  // The row moved, was ordered, or was covered since the page loaded. Absent
  // from the recomputation IS the refusal — there is nothing to take.
  if (!found) return c.json({ error: "unknown_build", code: "unknown_build" }, 409);

  const { row, build } = found;
  if (build.freeStock <= 0 || build.freeStockItemIds.length === 0) {
    return c.json({ error: "no_free_stock", code: "no_free_stock" }, 409);
  }
  const ref = stockRefOf(row.readyStock, row.so, row.destination);
  if (!ref) {
    // A customer row with no SO cannot say what the unit is committed to, and
    // `ops_stock_pool_draw` refuses an empty reference by name. Refused here
    // rather than there, so the operator gets the reason and not a 500.
    return c.json({ error: "no_reference", code: "no_reference" }, 422);
  }

  /**
   * K4'S DOOR, and only K4's door (0292/0294). It makes the draw and its
   * reason ONE transaction, flips the unit to `reserved` under this reference,
   * writes the ledger row, the audit row and the order's own timeline. A
   * fourth door writing `ops_stock_items` its own way would be a second truth
   * about the same units.
   *
   * ONE CALL PER RECORD, because that is the door's shape — and it is what
   * makes *"taking twice cannot over-draw"* structural rather than hopeful:
   * each call claims its unit only `where status = 'free'`, so a unit somebody
   * else took a second ago comes back null and is simply not counted.
   */
  const note = readyStockDrawNote(build.title);
  let taken = 0;
  const drawn: string[] = [];
  for (const itemId of build.freeStockItemIds) {
    const { data, error } = await sb.rpc("ops_stock_pool_draw", {
      p_ref: ref,
      // P13 (0322) — K4's own sixth reason. P10 wrote `other` + a note because
      // the five had no row for *taken instead of buying it*; Loo added the
      // word on 2026-08-04, so the ledger now says it in its own vocabulary
      // and the monthly split stops reading as an unexplained `Other`.
      p_reason: READY_STOCK_DRAW_REASON,
      p_note: note,
      p_item_id: itemId,
      p_sku: null,
      p_condition: null,
      p_wh: null,
    });
    if (error) {
      const m = mapPgError(error);
      return c.json({ ...(m.body as object), taken }, m.status);
    }
    if (!data) continue; // no longer free — somebody else got there first
    drawn.push(itemId);
    taken += res.data.stockQtyById.get(itemId) ?? 1;
  }

  if (taken === 0) {
    return c.json({ error: "no_free_stock", code: "no_free_stock" }, 409);
  }

  /**
   * A TYPED DEMAND'S REMAINDER FALLS THROUGH ITS OWN DOOR (0320).
   *
   * A customer line needs nothing here: the ledger row just written IS the
   * record, and the next read nets it. A typed demand carries a counter, and
   * `purchasing_demand_record_issue` is the only thing allowed to move it —
   * additive, `FOR UPDATE`, and refusing an over-issue by name.
   *
   * It runs AFTER the draw on purpose. If it fails, the units are reserved and
   * the demand still asks for them: we would buy too many, which is visible on
   * the next read and recoverable. The other order would have us buy too few,
   * and a customer short of goods is not recoverable by looking at a screen.
   */
  if (row.readyStock) {
    const m = /^demand:(.+)$/.exec(row.orderId);
    if (m) {
      const { error } = await sb.rpc("purchasing_demand_record_issue", {
        p_id: m[1]!,
        p_qty: taken,
        p_po_id: null,
      });
      if (error) {
        console.error("purchase_demands stock take not recorded", m[1], error.message);
        return c.json(
          {
            error: "demand_not_recorded",
            code: "demand_not_recorded",
            message: `${taken} unit(s) were reserved but the demand was not reduced.`,
            taken,
          },
          500,
        );
      }
    }
  }

  return c.json({ taken, reference: ref, items: drawn.length });
});

/**
 * `+ Create Purchase` — the manual entrance (Jess, 2026-08-03).
 *
 * V1 buys READY STOCK and nothing else. Display begins at the Dealer/Sales
 * portal as a Display Request and Office at a future internal request
 * workflow; both will reach purchasing through this same table, and neither
 * starts here — so neither appears in this body, and there is no disabled
 * option anywhere to suggest otherwise.
 *
 * THE PURPOSE IS SENT EXPLICITLY, not inferred from the absence of others
 * (her correction, same day). The CLIENT cannot choose it: it is written here,
 * so a browser can never file a demand as something else.
 *
 * THE SUPPLIER IS NOT IN THE BODY EITHER — the RPC derives it from the SKU. A
 * product has one factory, and a demand pointed at the wrong one becomes a
 * purchase order pointed at the wrong one.
 */
/**
 * `GET /demand/pick-items` — what the Create Purchase picker chooses from
 * (card P15, Loo 2026-08-04).
 *
 * **IT EXISTS BECAUSE THE STOCK NUMBERS CANNOT BE COMPUTED IN THE BROWSER.**
 * The card's Must-NOT is explicit — *"let the picker compute stock its own
 * way — read P10's rule"* — and P10's rule reads `ops_stock_items` at the own
 * warehouse through `stockMatchKey`. The dialog had only the catalog bundle,
 * which knows nothing about the register, so a browser-side count would have
 * been a second rule by construction. This route calls `readFreeStock`, the
 * literal function the grid's offer is built from.
 *
 * THREE NUMBERS, ONE READ, AND EACH MEANS SOMETHING DIFFERENT:
 *
 *   On Hand   every unit standing in the warehouse, whatever its condition —
 *             a damaged mattress is still in the building.
 *   Reserved  spoken for by an order. Context, never cover.
 *   Free      P10's own answer, unmodified: free · sound · at that warehouse.
 *
 * On live data today two of them agree (87 free, 0 reserved, measured
 * 2026-08-04) and that is honest rather than redundant — `Reserved 0` is the
 * fact that nothing is spoken for, and the three separate the day a
 * reservation exists.
 *
 * THE SUPPLIER RIDES ALONG AS A FACT. `purchasing_create_demand` derives it
 * from the SKU and there is no parameter to override it; this is the same
 * derivation shown a step earlier so an operator can predict which purchase
 * order their demand will join (the engine groups by supplier × category).
 *
 * A SKU WITH NO SUPPLIER IS NOT OFFERED. The RPC refuses it by name
 * (`sku_has_no_supplier`), and offering it teaches the operator that refusals
 * are random rather than a configuration hole.
 */
toOrderRouter.get("/demand/pick-items", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: skuRows, error: skuErr } = await sb
    .from("product_skus")
    .select("sku, variant, variant_kind, supplier_id, model_id")
    .not("supplier_id", "is", null);
  if (skuErr) {
    const m = mapPgError(skuErr);
    return c.json(m.body, m.status);
  }

  const { data: modelRows, error: modelErr } = await sb
    .from("product_models")
    .select("id, name");
  if (modelErr) {
    const m = mapPgError(modelErr);
    return c.json(m.body, m.status);
  }
  const modelName = new Map(
    (modelRows ?? []).map((m) => [m.id as string, (m.name as string) ?? ""]),
  );

  const { data: supRows, error: supErr } = await sb.from("suppliers").select("id, name");
  if (supErr) {
    const m = mapPgError(supErr);
    return c.json(m.body, m.status);
  }
  const supplierName = new Map(
    (supRows ?? []).map((s) => [s.id as string, (s.name as string) ?? ""]),
  );

  // P10's rule, called rather than copied.
  const { stockWarehouse, freeStock } = await readFreeStock(sb);

  /** On Hand and Reserved — the register's other two questions, one query. */
  const onHandByKey = new Map<string, number>();
  const reservedByKey = new Map<string, number>();
  if (stockWarehouse) {
    try {
      const { data: rows, error } = await sb
        .from("ops_stock_items")
        .select("sku, qty, status")
        // `free` and `reserved` are the two statuses that mean the unit is
        // HERE. `incoming` is on its way and is not on hand; `sold`,
        // `transferred`, `voided`, `returned_to_supplier` and `written_off`
        // have left. `on_hold` IS here — R4 quarantines it in the building —
        // so it counts as On Hand and, correctly, never as Free.
        .in("status", ["free", "reserved", "on_hold"])
        .eq("warehouse_id", stockWarehouse.id);
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) {
        const key = stockMatchKey(r.sku as string);
        const qty = Math.max(1, Number(r.qty ?? 1));
        onHandByKey.set(key, (onHandByKey.get(key) ?? 0) + qty);
        if (r.status === "reserved") {
          reservedByKey.set(key, (reservedByKey.get(key) ?? 0) + qty);
        }
      }
    } catch (e) {
      // Same contract as `readFreeStock`: the picker degrades to zeroes rather
      // than taking the dialog down. A demand can always be typed.
      console.error("stock counts unavailable — picker shows none", (e as Error).message);
    }
  }

  const items: DemandPickItem[] = (skuRows ?? []).map((s) => {
    const sku = s.sku as string;
    const key = stockMatchKey(sku);
    return {
      sku,
      label: railItemLabel(
        modelName.get(s.model_id as string) ?? sku,
        s.variant_kind === "size" ? ((s.variant as string) ?? null) : null,
      ),
      supplier: supplierName.get(s.supplier_id as string) ?? null,
      onHand: onHandByKey.get(key) ?? 0,
      reserved: reservedByKey.get(key) ?? 0,
      free: (freeStock[key] ?? []).reduce((n, r) => n + r.qty, 0),
    };
  });
  items.sort((a, b) => a.sku.localeCompare(b.sku));

  return c.json({ items, stockWarehouse: stockWarehouse?.name ?? null });
});

const demandBody = z.object({
  sku: z.string().min(1),
  qty: z.number().int().min(1),
  destinationId: z.string().uuid(),
  requiredBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  remark: z.string().max(500).nullish(),
  /**
   * P15 — the Source. **The enum is the SHARED constant, not a list retyped
   * here**: `DEMAND_PURPOSES` mirrors `purchase_demands.purpose`'s CHECK and
   * `purchasing_create_demand`'s own gate, so the picker, this validator and
   * the database cannot come to hold three different lists — which is exactly
   * what 0322 had to repair on the pool's reasons.
   *
   * OPTIONAL, and that is a compatibility decision rather than an oversight: a
   * browser still holding the pre-P15 bundle posts no `purpose`, and it must
   * keep working. It falls to `ready_stock` — the RPC's own default, and the
   * only value that browser could ever have meant.
   *
   * THERE IS NO `supplier` KEY AND THERE MAY NEVER BE ONE. The supplier is
   * derived from the SKU inside the RPC; the dialog SHOWS it as a fact. A
   * client that could name it is a client that could name the wrong factory.
   */
  purpose: z.enum(DEMAND_PURPOSE_VALUES as [string, ...string[]]).optional(),
});

toOrderRouter.post("/demand", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = demandBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const { sku, qty, destinationId, requiredBy, remark, purpose } = parsed.data;

  const { data, error } = await sb.rpc("purchasing_create_demand", {
    p_sku: sku,
    p_qty: qty,
    p_destination_id: destinationId,
    p_required_by: requiredBy ?? null,
    p_remark: remark ?? null,
    p_purpose: purpose ?? DEMAND_PURPOSE_DEFAULT,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? { ok: true });
});

/**
 * `Cancel` on a demand row — and on the REMAINDER of a part-ordered one
 * (Loo, 2026-08-04, card P12).
 *
 * IT SHIPS WITH ITS BUTTON, in the same card, because C1 deleted a live route
 * whose only caller had gone: *a route with no caller is a bypass one curl
 * away.* The inverse is the same fault — a button with no door is a lie.
 *
 * NO QUANTITY IS IN THE BODY, and that is the design rather than an omission.
 * A cancel takes the whole remainder or it is not a cancel, and `remaining_qty`
 * is GENERATED in the database (0320), so the number nobody typed is also a
 * number nobody can get wrong. What the RPC answers with — `cancelled` — is
 * read back off the row, so the figure the operator is told is the figure the
 * record now holds.
 *
 * `issued_qty` and `po_id` are untouched by the door: what was already ordered
 * keeps its purchase order, and stopping THAT is the purchase order's own
 * business (`PURCHASING-WORKING-FLOW.md` §9).
 *
 * There is no DELETE route here and there may never be one. Cancel keeps the
 * record; test rubbish is cleaned by SQL on request and the database starts
 * clean at go-live, so nothing is owed. A delete built for testing survives
 * into production as a way to erase a real purchase record leaving no trace.
 */
const cancelDemandBody = z.object({
  // Mandatory, and refused in three places rather than one: here, in the RPC by
  // name (`reason_required`), and by the table's own `cancel_pair` CHECK. A
  // cancellation without a reason is half a record.
  reason: z.string().trim().min(1).max(500),
});

toOrderRouter.post("/demand/:id/cancel", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const id = c.req.param("id");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return c.json({ error: "invalid_id", code: "invalid_param" }, 400);
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = cancelDemandBody.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }

  const { data, error } = await sb.rpc("purchasing_cancel_demand", {
    p_id: id,
    p_reason: parsed.data.reason,
  });
  if (error) {
    // `already_cancelled` and `nothing_to_cancel` arrive as P0001 and reach the
    // page as their own named codes — an operator meeting one must be told
    // which of the two happened, not that something went wrong.
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? { ok: true });
});


/**
 * POST /issue-batch — THE ONE DOOR SO BATCH PURCHASE ISSUES THROUGH
 * (CARD-2026-08-22-purchasing-02 §7.3; `docs/purchasing/MASTER.md` §5.3).
 *
 * The operator ticks lines across many suppliers and many Sales Orders, arranges
 * where each buy goes, and presses one button. This endpoint turns that into
 * every purchase order it implies, in ONE transaction: all of them are created
 * or none is.
 *
 * ── NOTHING THE BROWSER SENT IS TRUSTED ─────────────────────────────────────
 *
 * The request carries demand IDS and DESTINATIONS, and that is all it is
 * allowed to carry. Quantity comes from the server's own recomputation, the
 * supplier comes from the catalog, the arrival date comes from the settings
 * engine, the grouping is recomputed here, and the numbers are minted by the
 * RPC. A stale tab can therefore ask for last hour's demand and be told no;
 * it cannot order it.
 *
 * ── WHY THE GROUP KEY HAS FOUR PARTS AND NOT TWO ────────────────────────────
 *
 * §4.2 requires one supplier and one `Deliver To` per document. It does not
 * require the CONVERSE — that everything sharing those two must merge — and two
 * shipped Carres rules already partition further:
 *
 *   · a sofa is ONE PO PER CUSTOMER ORDER (locked 2026-07-27), because a
 *     matched set is made and delivered together;
 *   · a proposal is supplier × CATEGORY, so a supplier's mattresses and its
 *     bedframes are already separate documents today.
 *
 * Merging either of those would be a business change this Card does not carry.
 * So the key is `supplier × destination × category × (sofa ? order : "")`, which
 * satisfies §4.2 strictly and changes no existing behaviour except the one this
 * Card asked for: a destination split makes a second document.
 */
const soBatchIssueInput = z
  .object({
    selections: z
      .array(
        z.object({
          demandId: z.string().min(1),
          allocations: z
            .array(
              z.object({
                destinationId: z.string().uuid(),
                qty: z.number().int().positive(),
              }),
            )
            .min(1),
        }),
      )
      .min(1)
      .max(500),
    documentDecisions: z
      .array(
        z.object({
          supplierId: z.string().uuid(),
          destinationId: z.string().uuid(),
          procurementPartnerId: z.string().uuid().nullable(),
          lineDecisions: z
            .array(
              z.discriminatedUnion("treatment", [
                z.object({
                  sku: z.string().min(1),
                  treatment: z.literal("normal"),
                  unitCost: z.number().positive(),
                  costSource: z.enum(["catalog", "hand_entered"]),
                }),
                z.object({
                  sku: z.string().min(1),
                  treatment: z.literal("free_of_charge"),
                  reason: z.string().trim().min(1).max(500),
                }),
              ]),
            )
            .max(500),
        }),
      )
      .max(200)
      .default([]),
  })
  .strict();

type BatchLineDecision = z.infer<
  typeof soBatchIssueInput
>["documentDecisions"][number]["lineDecisions"][number];

toOrderRouter.post("/issue-batch", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json", code: "invalid_param" }, 400);
  }
  const parsed = soBatchIssueInput.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  }
  const { selections, documentDecisions } = parsed.data;

  /* ── 1 · WHO ────────────────────────────────────────────────────────────
   *
   * Only Current PO Duty issues (MASTER §5.3). The browser's `mayIssue` is a
   * convenience; this is the authority, and it is asked BEFORE any work so an
   * unauthorised request costs one query rather than a recomputation. */
  const month = monthKeyMYT();
  const duty = await sb
    .from("ops_po_duty")
    .select("user_id")
    .eq("month", month)
    .maybeSingle();
  if (duty.error) {
    const m = mapPgError(duty.error);
    return c.json(m.body, m.status);
  }
  const dutyRow = duty.data as { user_id?: string } | { user_id?: string }[] | null;
  const dutyId =
    (Array.isArray(dutyRow) ? dutyRow[0]?.user_id : dutyRow?.user_id) ?? null;
  if (!dutyId || dutyId !== c.var.auth.id) {
    return c.json(
      {
        error: "not_po_duty",
        code: "not_po_duty",
        message: "Only the current PO duty holder can issue purchase orders.",
      },
      403,
    );
  }

  /* ── 2 · duplicates, before anything expensive ──────────────────────────── */
  const seen = new Set<string>();
  for (const s of selections) {
    if (seen.has(s.demandId)) {
      return c.json({ error: "duplicate_demand", code: "duplicate_demand" }, 422);
    }
    seen.add(s.demandId);
  }

  /* ── 3 · RECOMPUTE. The screen is a view; this is the truth. ─────────────── */
  const res = await loadToOrder(sb);
  if (!res.ok) return c.json(res.body as Record<string, unknown>, res.status as 400);

  /** demandId → the build it names, and everything the build belongs to. */
  const index = new Map<
    string,
    {
      proposal: (typeof res.data.proposals)[number];
      row: ToOrderRow;
      build: ToOrderBuild;
    }
  >();
  for (const proposal of res.data.proposals) {
    for (const row of proposal.rows) {
      if (row.readyStock) continue; // Manual Purchase has its own door.
      for (const build of row.builds) {
        index.set(`build::${row.orderId}::${build.key}`, { proposal, row, build });
      }
    }
  }

  /* ── 4 · the destinations, read once ────────────────────────────────────── */
  const destRes = await sb
    .from("purchasing_destinations")
    .select("id, name, is_default, active");
  if (destRes.error) {
    const m = mapPgError(destRes.error);
    return c.json(m.body, m.status);
  }
  const destById = new Map(
    ((destRes.data ?? []) as Record<string, unknown>[]).map((d) => [
      d.id as string,
      { id: d.id as string, name: (d.name as string) ?? "", active: d.active !== false },
    ]),
  );

  /* ── 5 · every refusal, before a single document is composed ────────────── */
  type Alloc = { demandId: string; destinationId: string; qty: number };
  const allocations: Alloc[] = [];
  for (const s of selections) {
    const hit = index.get(s.demandId);
    /* Absent from the recomputation means CHANGED, CANCELLED, COVERED or
       never real. All four read the same from here, and all four must fail. */
    if (!hit) {
      return c.json(
        { error: "unknown_demand", code: "unknown_demand", demandId: s.demandId },
        409,
      );
    }
    if (hit.proposal.blocked === "production_days") {
      return c.json(
        { error: "production_days_required", code: "production_days_required" },
        422,
      );
    }
    /* An undated customer order stays visible and unbuyable: the arrival date
       a supplier is asked to hit is derived from the promise, and there is no
       promise. */
    if (hit.row.delivery == null) {
      return c.json(
        {
          error: "blocked_delivery_date",
          code: "blocked_delivery_date",
          demandId: s.demandId,
          message: "Customer delivery date must be confirmed before Issue PO.",
        },
        422,
      );
    }
    let total = 0;
    for (const a of s.allocations) {
      const dest = destById.get(a.destinationId);
      if (!dest) {
        return c.json(
          { error: "unknown_destination", code: "unknown_destination" },
          422,
        );
      }
      if (!dest.active) {
        return c.json(
          {
            error: "inactive_destination",
            code: "inactive_destination",
            message: `${dest.name} is closed.`,
          },
          422,
        );
      }
      total += a.qty;
      allocations.push({ demandId: s.demandId, destinationId: a.destinationId, qty: a.qty });
    }
    /* THE ARRANGEMENT MUST ADD BACK TO THE SERVER'S OWN REMAINDER. The browser
       checked this too; that check was for the operator, this one is the law. */
    if (total !== hit.build.qty) {
      return c.json(
        {
          error: "allocation_mismatch",
          code: "allocation_mismatch",
          demandId: s.demandId,
          arranged: total,
          toBuy: hit.build.qty,
        },
        422,
      );
    }
  }

  /* ── 6 · GROUPING, recomputed here (see the header) ─────────────────────── */
  type Group = {
    key: string;
    proposal: (typeof res.data.proposals)[number];
    destinationId: string;
    buildKeys: string[];
  };
  const groups = new Map<string, Group>();
  for (const a of allocations) {
    const hit = index.get(a.demandId)!;
    const perOrder = isOnePoPerOrder(hit.proposal.category);
    const key = [
      hit.proposal.supplierId,
      a.destinationId,
      hit.proposal.category,
      perOrder ? hit.row.orderId : "",
    ].join("::");
    let group = groups.get(key);
    if (!group) {
      group = { key, proposal: hit.proposal, destinationId: a.destinationId, buildKeys: [] };
      groups.set(key, group);
    }
    if (!group.buildKeys.includes(hit.build.key)) group.buildKeys.push(hit.build.key);
  }

  const warehouse = res.data.stockWarehouse;
  if (!warehouse) {
    return c.json({ error: "no_warehouse", code: "no_warehouse" }, 422);
  }

  /* Partners, read once, only if some group needs one. */
  const anyPickup = [...groups.values()].some(
    (g) => g.proposal.supplierKind === "factory_pickup",
  );
  let validPartners = new Set<string>();
  if (anyPickup) {
    const partners = await sb.from("delivery_partners").select("id");
    if (partners.error) {
      const m = mapPgError(partners.error);
      return c.json(m.body, m.status);
    }
    validPartners = new Set((partners.data ?? []).map((p) => p.id as string));
  }

  /* A decision is keyed the way the OPERATOR made it — per supplier and
     destination, which is the document they were looking at. */
  const decisionsFor = (supplierId: string, destinationId: string) =>
    documentDecisions.find(
      (d) => d.supplierId === supplierId && d.destinationId === destinationId,
    );

  /**
   * A DECISION FOR A LINE NOBODY IS BUYING IS STALE, NOT NOISE. It means the
   * operator priced something the recomputation has since moved or covered, and
   * issuing the rest would send a price they never actually confirmed.
   *
   * The check is made against the whole supplier × destination SURFACE the
   * operator saw, not against one document: the server may split that surface
   * further (a sofa is one PO per customer order), and the browser cannot know
   * where those cuts fall. Inside each document, only the decisions whose SKU
   * is actually on it are applied.
   */
  const surfaceSkus = new Map<string, Set<string>>();
  for (const group of groups.values()) {
    const key = `${group.proposal.supplierId}::${group.destinationId}`;
    const plan = planFromDocuments(group.proposal, [
      { key: group.key, include: true, buildKeys: group.buildKeys },
    ]);
    const set = surfaceSkus.get(key) ?? new Set<string>();
    for (const line of plan[0]?.lines ?? []) set.add(line.sku);
    surfaceSkus.set(key, set);
  }
  for (const d of documentDecisions) {
    const known = surfaceSkus.get(`${d.supplierId}::${d.destinationId}`);
    if (!known) continue;
    if (d.lineDecisions.some((l) => !known.has(l.sku))) {
      return c.json({ error: "stale_cost_decision", code: "stale_cost_decision" }, 409);
    }
  }

  const governedPos: Record<string, unknown>[] = [];
  const created: { key: string; supplierId: string; destinationId: string }[] = [];

  for (const group of groups.values()) {
    const docs: IssueDocument[] = [
      { key: group.key, include: true, buildKeys: group.buildKeys },
    ];
    const check = validateIssuePlan(group.proposal, docs);
    if (!check.ok) {
      return c.json({ error: check.code, code: check.code, message: check.message }, 422);
    }
    const plan = planFromDocuments(group.proposal, docs);
    if (plan.length !== 1) {
      return c.json({ error: "nothing_to_issue", code: "nothing_to_issue" }, 409);
    }
    const po = plan[0]!;

    const decision = decisionsFor(group.proposal.supplierId, group.destinationId);
    const partnerId = decision?.procurementPartnerId ?? null;
    const needsPartner = group.proposal.supplierKind === "factory_pickup";
    if (needsPartner && (!partnerId || !validPartners.has(partnerId))) {
      return c.json(
        {
          error: "pickup_partner_required",
          code: "pickup_partner_required",
          documentKey: group.key,
        },
        422,
      );
    }
    if (!needsPartner && partnerId) {
      return c.json(
        { error: "pickup_partner_not_allowed", code: "pickup_partner_not_allowed" },
        422,
      );
    }

    const byLine = new Map<string, BatchLineDecision>();
    for (const d of decision?.lineDecisions ?? []) {
      if (byLine.has(d.sku)) {
        return c.json({ error: "duplicate_cost_decision", code: "duplicate_cost_decision" }, 422);
      }
      byLine.set(d.sku, d);
    }
    const lines: Record<string, unknown>[] = [];
    for (const line of po.lines) {
      const d = byLine.get(line.sku);
      if (d?.treatment === "free_of_charge") {
        lines.push({
          sku: line.sku,
          qty: line.qty,
          cost: 0,
          cost_source: "hand_entered",
          commercial_treatment: "free_of_charge",
          commercial_reason: d.reason.trim(),
        });
        continue;
      }
      const liveCost = res.data.catalog.get(line.sku)?.cost ?? null;
      if (d?.treatment === "normal") {
        /* A CATALOG PRICE THAT MOVED IS A COMMERCIAL DECISION, NOT A RETRY.
           Operations may not silently accept it; the document stops and the
           approver owns it (MASTER §5.6). */
        if (d.costSource === "catalog" && liveCost !== d.unitCost) {
          return c.json(
            { error: "stale_catalog_cost", code: "stale_catalog_cost", sku: line.sku },
            409,
          );
        }
        lines.push({
          sku: line.sku,
          qty: line.qty,
          cost: d.unitCost,
          cost_source: d.costSource,
          commercial_treatment: "normal",
          commercial_reason: null,
        });
        continue;
      }
      if (liveCost == null || liveCost <= 0) {
        return c.json(
          {
            error: "cost_required",
            code: "cost_required",
            documentKey: group.key,
            sku: line.sku,
          },
          422,
        );
      }
      lines.push({
        sku: line.sku,
        qty: line.qty,
        cost: liveCost,
        cost_source: "catalog",
        commercial_treatment: "normal",
        commercial_reason: null,
      });
    }

    governedPos.push({
      supplier_id: group.proposal.supplierId,
      warehouse_id: warehouse.id,
      destination_id: group.destinationId,
      /* The frozen estimate, from the ONE arithmetic (`expectedArrivalOf`).
         A PO being born starts its clock today. */
      eta_date: expectedArrivalOf(res.data.settings, {
        supplierId: group.proposal.supplierId,
        category: group.proposal.category,
        fromIso: todayIso(),
      }),
      procurement_partner_id: partnerId,
      so_refs: po.soRefs,
      lines,
    });
    created.push({
      key: group.key,
      supplierId: group.proposal.supplierId,
      destinationId: group.destinationId,
    });
  }

  if (governedPos.length === 0) {
    return c.json({ error: "nothing_to_issue", code: "nothing_to_issue" }, 409);
  }

  /* ── 7 · ONE TRANSACTION. A failure on the seventh document rolls back the
   * first six — including their commercial decisions, destinations and audit
   * history. There is no partial batch to clean up, because there is no
   * partial batch. */
  const { data: batch, error: batchErr } = await sb.rpc("purchasing_issue_pos_batch", {
    p_pos: governedPos,
  });
  if (batchErr) {
    const m = mapPgError(batchErr);
    return c.json(m.body, m.status);
  }
  const ids = ((batch as { po_ids?: unknown } | null)?.po_ids ?? []) as string[];
  if (ids.length !== governedPos.length) {
    return c.json({ error: "po_not_created", code: "po_not_created" }, 500);
  }

  return c.json({
    ok: true,
    /* The official identity, and the two facts the evidence step needs to name
       the document it is chasing. */
    pos: ids.map((id, i) => ({
      id,
      supplierId: created[i]!.supplierId,
      supplierName: res.data.supplierNames.get(created[i]!.supplierId) ?? null,
      destinationId: created[i]!.destinationId,
      destination: destById.get(created[i]!.destinationId)?.name ?? null,
    })),
  });
});

export default toOrderRouter;
