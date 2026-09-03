import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import {
  DEMAND_PURPOSE_DEFAULT,
  DEMAND_PURPOSE_VALUES,
  composeDocumentLines,
  documentPartitionKey,
  expectedArrivalOf,
  isToOrderCategory,
  PURCHASING_REFUSAL_CODES,
  purchasingRefusal,
  readyStockDrawNote,
  READY_STOCK_DRAW_REASON,
  stockMatchKey,
  railItemLabel,
  type DemandPickItem,
  type ProductCategory,
  type IssueDocument,
  type PoDocumentAllocation,
  type ToOrderBuild,
  type ToOrderOrderedRow,
  type ToOrderRow,
} from "@carres/shared";
import { validateIssuePlan } from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { purchasingActorMayIssue } from "../../lib/purchasing-po-authority";
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
          ((p.so_refs as number[] | null) ?? []).some(
            (so) => Number(so) === scopeSo,
          ),
        );
  if (poErr || !poRows || poRows.length === 0) return [];

  // The catalog arrives from loadToOrder — but its no-open-orders early
  // return carries an EMPTY map, and recent POs can outlive their orders.
  // Read it here in that one case, whole, same rule as loadToOrder (§: a SKU
  // never goes into an `.in()`).
  if (catalog.size === 0) {
    const { data: skuRows } = await sb
      .from("product_skus")
      .select(
        "sku, supplier_id, cost, variant, variant_kind, product_models!inner(category, name)",
      );
    for (const row of (skuRows ?? []) as Record<string, unknown>[]) {
      const pm = row.product_models as {
        category?: string | null;
        name?: string | null;
      } | null;
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

  const soRefs = [
    ...new Set(poRows.flatMap((p) => (p.so_refs as number[] | null) ?? [])),
  ];
  const orderBySo = new Map<number, Record<string, unknown>>();
  const orderLinesByOrder = new Map<
    string,
    { sku: string; qty: number; attrs: unknown }[]
  >();
  if (soRefs.length > 0) {
    for (const batch of chunk(soRefs)) {
      const { data, error } = await sb
        .from("orders")
        .select(
          "id, so, customer_name, delivery_date, delivery_date_tbd, proceed_date",
        )
        .in("so", batch);
      if (error) return [];
      for (const o of data ?? [])
        orderBySo.set(Number(o.so), o as Record<string, unknown>);
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
        arr.push({
          sku: l.sku as string,
          qty: Number(l.qty ?? 0),
          attrs: l.attrs,
        });
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
          supplierName:
            supplierNames.get((po.supplier_id as string | null) ?? "") ?? null,
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
        ? (orderLinesByOrder.get(order.id as string) ?? []).filter((l) =>
            poSkus.has(l.sku),
          )
        : [];
      const tbd = Boolean(order?.delivery_date_tbd);
      const base = {
        poId: po.id as string,
        placedAt,
        category,
        supplierId: (po.supplier_id as string | null) ?? "",
        supplierName:
          supplierNames.get((po.supplier_id as string | null) ?? "") ?? null,
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
        proceedDate:
          ((order?.proceed_date as string | null) ?? null)?.slice(0, 10) ??
          null,
      };
      if (covered.length === 0) {
        // Nothing matched — still one honest row per PO line.
        for (const l of poLines)
          rows.push({ ...base, model: labelOf(l.sku), qty: l.qty });
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
            category === "sofa"
              ? 1
              : members.reduce((sum, m) => sum + m.qty, 0),
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
  if (!res.ok)
    return c.json(res.body as Record<string, unknown>, res.status as 400);

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
  const { data: supRows, error: supErr } = await sb
    .from("suppliers")
    .select("id, name, kind");
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
    let blockedProductionDays = res.data.blocked.filter(
      (row) => row.so === scopeSo,
    ).length;
    let blockedDeliveryDate = 0;
    let alreadyCovered = 0;
    for (const proposal of proposals) {
      for (const row of proposal.rows) {
        for (const build of row.builds) {
          /* `alreadyCovered` reports, it no longer excludes. A build sitting
             wholly on an open purchase order is issuable like any other since
             the SO Batch register began offering it a tick, so counting it
             here as NOT issuable would have this door and that one disagree
             about the same build. The tally stays because "these units are
             already on order" is worth saying; it just no longer decides. */
          if (proposal.blocked === "production_days")
            blockedProductionDays += 1;
          else if (row.delivery == null) blockedDeliveryDate += 1;
          else {
            issuable += 1;
            if (build.fullyOnPo) alreadyCovered += 1;
          }
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
  if (!parsed.success)
    return c.json({ error: "invalid_body", code: "invalid_param" }, 400);
  const { orderId, buildKey } = parsed.data;

  const res = await loadToOrder(sb);
  if (!res.ok)
    return c.json(res.body as Record<string, unknown>, res.status as 400);

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
  if (!found)
    return c.json({ error: "unknown_build", code: "unknown_build" }, 409);

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
        console.error(
          "purchase_demands stock take not recorded",
          m[1],
          error.message,
        );
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

  const { data: supRows, error: supErr } = await sb
    .from("suppliers")
    .select("id, name");
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
      console.error(
        "stock counts unavailable — picker shows none",
        (e as Error).message,
      );
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
  requiredBy: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
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
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
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
        z
          .object({
            demandId: z.string().min(1),
            allocations: z
              .array(
                z
                  .object({
                    destinationId: z.string().uuid(),
                    qty: z.number().int().positive(),
                  })
                  .strict(),
              )
              .min(1),
          })
          /* STRICT, and that is the guard. A selection carries a demand id and
             an arrangement; a `lines`, a `sku`, a `qty` or a `cost` smuggled
             beside them is REFUSED rather than ignored, because a field the
             server quietly drops is a field a client believes it sent. */
          .strict(),
      )
      .min(1)
      .max(500),
    documentDecisions: z
      .array(
        z
          .object({
            /** The exact partition key the operator reviewed (closure §4). */
            documentKey: z.string().min(1),
            supplierId: z.string().uuid(),
            destinationId: z.string().uuid(),
            procurementPartnerId: z.string().uuid().nullable(),
            lineDecisions: z
              .array(
                z.discriminatedUnion("treatment", [
                  z
                    .object({
                      sku: z.string().min(1),
                      treatment: z.literal("normal"),
                      unitCost: z.number().positive(),
                      costSource: z.enum(["catalog", "hand_entered"]),
                      /** The catalog price the operator REVIEWED (0380): the
                       *  server compares it with the live one and refuses a
                       *  change rather than adopting it silently. */
                      expectedCatalogCost: z.number().nonnegative().nullable().optional(),
                    })
                    /* A CATALOG LINE MUST ALSO DECLARE WHAT WAS REVIEWED
                       (0380). That is checked in the handler rather than here:
                       `discriminatedUnion` takes plain objects only, and a
                       schema-level refusal would arrive as `invalid_body` when
                       the operator needs to be told which SKU to look at. */
                    .strict(),
                  z
                    .object({
                      sku: z.string().min(1),
                      treatment: z.literal("free_of_charge"),
                      reason: z.string().trim().min(1).max(500),
                    })
                    .strict(),
                ]),
              )
              .max(500),
          })
          .strict(),
      )
      .max(200)
      .default([]),
  })
  .strict();

/**
 * EVERY REFUSAL LEAVES IN THE APPROVED TWO LINES
 * (`docs/COPY-STANDARD.md`; Card closure §9).
 *
 * `message` is LINE 1 — what is wrong — and `action` is LINE 2 — the act, its
 * object and what completes it. The words live in `purchasingRefusal` so the
 * browser, the Purchase Order page and this route cannot spell the same
 * refusal three ways. `code` still travels for the tests and the log.
 */
function refuse(
  c: Context<AppEnv>,
  status: 400 | 403 | 409 | 422 | 500,
  code: string,
  facts?: Parameters<typeof purchasingRefusal>[1],
) {
  const r = purchasingRefusal(code, facts);
  return c.json(
    { error: code, code, message: r.wrong, action: r.todo, ...(facts ?? {}) },
    status,
  );
}

type BatchLineDecision = z.infer<
  typeof soBatchIssueInput
>["documentDecisions"][number]["lineDecisions"][number];

/**
 * GET /cost-approvals?supplierId=…&skus=a,b,c — WHICH EXCEPTIONS ALREADY HAVE A
 * MANAGER'S APPROVAL (closure §2; 0380).
 *
 * A hand-entered price or a Free of Charge needs an approval record that PO Duty
 * cannot write for itself. Without this read the operator meets that rule only
 * as a refusal, after typing everything — and cannot tell "nobody has approved
 * this yet" from "somebody already did". The surface reads it so it can say
 * which, in advance.
 *
 * It is a READ of approvals that are still OPEN — unused and unexpired. RLS
 * decides who may see them; this route adds no authority of its own.
 */
toOrderRouter.get("/cost-approvals", requireOperation, async (c) => {
  const supplierId = (c.req.query("supplierId") ?? "").trim();
  const skus = (c.req.query("skus") ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  if (supplierId === "" || skus.length === 0 || skus.length > 500) {
    return refuse(c, 400, "invalid_param");
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  /* ⭐ NO SKU IN A POSTGREST `.in()` LIST. `sku` is free text and live rows carry
     a DOUBLE QUOTE (`Leg 4"`); PostgREST wraps a reserved-character value in
     double quotes, so one inside breaks the filter and the server answers with
     whatever it could parse. That defect put seven customer requirements on no
     purchase order on 2026-07-30. This supplier's OPEN approvals are a small
     slice, so they are read whole and matched here. */
  const { data, error } = await sb
    .from("po_cost_approvals")
    .select("id, sku, treatment, unit_cost, reason, expires_on, approved_at, approved_by")
    .eq("supplier_id", supplierId)
    .is("used_by_po", null)
    .order("approved_at", { ascending: false });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  const today = todayIso();
  const wanted = new Set(skus);
  const rows = ((data ?? []) as Record<string, unknown>[]).filter((r) => {
    if (!wanted.has(r.sku as string)) return false;
    const expires = r.expires_on as string | null;
    /* An approval is for a decision, not for ever. */
    return expires == null || expires >= today;
  });

  const byId = [
    ...new Set(
      rows
        .map((r) => r.approved_by as string | null)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  ];
  const named = new Map<string, string>();
  if (byId.length > 0) {
    const { data: people } = await sb.from("app_users").select("id, name, email").in("id", byId);
    for (const u of (people ?? []) as Record<string, unknown>[]) {
      const label = ((u.name as string | null) ?? "").trim() || ((u.email as string | null) ?? "");
      if (label) named.set(u.id as string, label);
    }
  }

  return c.json({
    approvals: rows.map((r) => ({
      sku: r.sku as string,
      treatment: r.treatment as "hand_entered" | "free_of_charge",
      unitCost: (r.unit_cost as number | null) ?? null,
      reason: (r.reason as string | null) ?? null,
      approvedBy: named.get(r.approved_by as string) ?? null,
      expiresOn: (r.expires_on as string | null) ?? null,
    })),
  });
});

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
   * The application and SQL both ask the governed capability. Duty/cover is
   * still resolved below when a refusal needs to name the normal owner. */
  const authority = await purchasingActorMayIssue(sb, c.var.auth.id);
  if (authority.error) {
    const m = mapPgError(authority.error);
    return c.json(m.body, m.status);
  }
  if (!authority.mayIssue) {
    const actorRes = await sb.rpc("purchasing_po_actor");
    if (actorRes.error) {
      const m = mapPgError(actorRes.error);
      return c.json(m.body, m.status);
    }
    const actor = (actorRes.data ?? {}) as { actor_user_id?: string | null };
    const actorId = actor.actor_user_id ?? null;
    if (!actorId) return refuse(c, 403, "no_po_duty_holder");
    let holder: string | null = null;
    const who = await sb
      .from("app_users")
      .select("name, email")
      .eq("id", actorId)
      .maybeSingle();
    const row = who.data as { name?: string | null; email?: string | null } | null;
    holder = (row?.name ?? "").trim() || (row?.email ?? "").trim() || null;
    return refuse(c, 403, "not_po_duty", { actor: holder });
  }

  /* ── 2 · duplicates, before anything expensive ──────────────────────────── */
  const seen = new Set<string>();
  for (const s of selections) {
    if (seen.has(s.demandId)) return refuse(c, 422, "duplicate_demand");
    seen.add(s.demandId);
  }

  /* ── 3 · RECOMPUTE. The screen is a view; this is the truth. ─────────────── */
  const res = await loadToOrder(sb);
  if (!res.ok)
    return c.json(res.body as Record<string, unknown>, res.status as 400);

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
        index.set(`build::${row.orderId}::${build.key}`, {
          proposal,
          row,
          build,
        });
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
      {
        id: d.id as string,
        name: (d.name as string) ?? "",
        active: d.active !== false,
      },
    ]),
  );

  /* ── 5 · every refusal, before a single document is composed ────────────── */
  type Alloc = { demandId: string; destinationId: string; qty: number };
  const allocations: Alloc[] = [];
  for (const s of selections) {
    const hit = index.get(s.demandId);
    /* Absent from the recomputation means CHANGED, CANCELLED, COVERED or
       never real. All four read the same from here, and all four must fail. */
    if (!hit) return refuse(c, 409, "unknown_demand");
    if (hit.proposal.blocked === "production_days") {
      return refuse(c, 422, "production_days_required", {
        supplier: hit.proposal.supplierName ?? null,
      });
    }
    /* An undated customer order stays visible and unbuyable: the arrival date
       a supplier is asked to hit is derived from the promise, and there is no
       promise. */
    if (hit.row.delivery == null) return refuse(c, 422, "blocked_delivery_date");
    let total = 0;
    for (const a of s.allocations) {
      const dest = destById.get(a.destinationId);
      if (!dest) return refuse(c, 422, "unknown_destination");
      if (!dest.active) {
        return refuse(c, 422, "inactive_destination", { destination: dest.name });
      }
      total += a.qty;
      allocations.push({
        demandId: s.demandId,
        destinationId: a.destinationId,
        qty: a.qty,
      });
    }
    /* THE ARRANGEMENT MUST ADD BACK TO THE SERVER'S OWN REMAINDER. The browser
       checked this too; that check was for the operator, this one is the law. */
    if (total !== hit.build.qty) {
      return refuse(c, 422, "allocation_mismatch", {
        arranged: total,
        toBuy: hit.build.qty,
      });
    }
  }

  /* ── 6 · GROUPING, recomputed here (see the header) ─────────────────────── */
  type Group = {
    key: string;
    proposal: (typeof res.data.proposals)[number];
    destinationId: string;
    buildKeys: string[];
    /** What this document actually carries — see `composeDocumentLines`. */
    allocs: PoDocumentAllocation[];
  };
  const groups = new Map<string, Group>();
  for (const a of allocations) {
    const hit = index.get(a.demandId)!;
    /* ⭐ THE SHARED PARTITION (Card closure §4). The browser computes this same
       key from the same facts, so `Issue N POs`, `1 of N`, the decisions, this
       grouping and `pos.length` cannot drift apart. Still RECOMPUTED here from
       the server's own recomputation — agreement, not trust. */
    const key = documentPartitionKey({
      supplierId: hit.proposal.supplierId,
      destinationId: a.destinationId,
      category: hit.proposal.category,
      orderId: hit.row.orderId,
    });
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        proposal: hit.proposal,
        destinationId: a.destinationId,
        buildKeys: [],
        allocs: [],
      };
      groups.set(key, group);
    }
    if (!group.buildKeys.includes(hit.build.key))
      group.buildKeys.push(hit.build.key);
    /* ⭐ THE ALLOCATED QUANTITY, not the build's. A build of 11 split 10 + 1
       across two destinations used to produce two purchase orders of ELEVEN,
       because each document's lines were read off the whole build. */
    group.allocs.push({
      build: hit.build,
      orderId: hit.row.orderId,
      so: hit.row.so,
      qty: a.qty,
    });
  }

  const warehouse = res.data.stockWarehouse;
  if (!warehouse) return refuse(c, 422, "no_warehouse");

  /* Partners, read once, only if some group needs one. */
  const anyPickup = [...groups.values()].some(
    (g) => g.proposal.supplierKind === "factory_pickup",
  );
  let validPartners = new Set<string>();
  const collectionBySupplier = new Map<
    string,
    { partnerId: string; fixedDestinationId: string | null }
  >();
  if (anyPickup) {
    const [partners, configured] = await Promise.all([
      sb.from("delivery_partners").select("id"),
      sb
        .from("purchasing_supplier_settings")
        .select("supplier_id, fixed_destination_id, collected_by_partner_id"),
    ]);
    if (partners.error || configured.error) {
      const m = mapPgError(partners.error ?? configured.error!);
      return c.json(m.body, m.status);
    }
    validPartners = new Set((partners.data ?? []).map((p) => p.id as string));
    for (const row of (configured.data ?? []) as Record<string, unknown>[]) {
      const partnerId = row.collected_by_partner_id as string | null;
      if (!partnerId || !validPartners.has(partnerId)) continue;
      collectionBySupplier.set(row.supplier_id as string, {
        partnerId,
        fixedDestinationId: (row.fixed_destination_id as string | null) ?? null,
      });
    }
  }

  /* ⭐ A DECISION BELONGS TO ONE DOCUMENT (Card closure §4). Keyed by
     supplier + destination it was COARSER than the partition the server
     creates, so a price reviewed on one sofa order could be applied to another
     customer's document. It now names the exact key the operator reviewed. */
  const decisionsFor = (key: string) =>
    documentDecisions.find((d) => d.documentKey === key);

  /**
   * THE LINES EVERY DOCUMENT CARRIES, composed once.
   *
   * Composed from the ALLOCATION and carrying the per-unit customer lineage
   * (0382), so the same walk answers three questions that used to be answered
   * separately and could disagree: how many units, whose they are, and which
   * SKUs the operator must have priced.
   */
  const composed = new Map<string, ReturnType<typeof composeDocumentLines>>();
  for (const group of groups.values()) {
    const lines = composeDocumentLines(group.allocs);
    if (!lines.ok) {
      return refuse(c, 422, lines.code, {
        supplier: group.proposal.supplierName ?? null,
      });
    }
    composed.set(group.key, lines);
  }

  /* DUPLICATE · FOREIGN · STALE — each refused BY NAME. "Your prices were
     ignored" is not something an operator can act on. */
  const seenDecision = new Set<string>();
  for (const d of documentDecisions) {
    if (seenDecision.has(d.documentKey)) return refuse(c, 422, "duplicate_decision");
    seenDecision.add(d.documentKey);
    const doc = composed.get(d.documentKey);
    if (!doc?.ok) {
      return refuse(c, 409, "foreign_decision", { po: null });
    }
    const known = new Set(doc.lines.map((l) => l.sku));
    const skus = new Set<string>();
    for (const l of d.lineDecisions) {
      if (skus.has(l.sku)) return refuse(c, 422, "duplicate_cost_decision", { sku: l.sku });
      skus.add(l.sku);
      if (!known.has(l.sku)) return refuse(c, 409, "stale_cost_decision", { sku: l.sku });
    }
  }

  const governedPos: Record<string, unknown>[] = [];
  const created: { key: string; supplierId: string; destinationId: string }[] =
    [];

  for (const group of groups.values()) {
    const docs: IssueDocument[] = [
      { key: group.key, include: true, buildKeys: group.buildKeys },
    ];
    const check = validateIssuePlan(group.proposal, docs);
    if (!check.ok) return refuse(c, 422, check.code ?? "nothing_to_issue");
    const composedDoc = composed.get(group.key)!;
    if (!composedDoc.ok) return refuse(c, 409, "nothing_to_issue");
    const soRefs = [
      ...new Set(
        group.allocs.map((a) => a.so).filter((v): v is number => v != null),
      ),
    ];

    const decision = decisionsFor(group.key);
    const needsPartner = group.proposal.supplierKind === "factory_pickup";
    const collection = collectionBySupplier.get(group.proposal.supplierId) ?? null;
    const partnerId = needsPartner ? (collection?.partnerId ?? null) : null;
    if (needsPartner && !partnerId) {
      return refuse(c, 422, "pickup_partner_required", {
        supplier: group.proposal.supplierName ?? null,
      });
    }
    if (
      needsPartner &&
      collection?.fixedDestinationId &&
      collection.fixedDestinationId !== group.destinationId
    ) {
      return refuse(c, 422, "supplier_collection_destination_mismatch", {
        supplier: group.proposal.supplierName ?? null,
        /* The destination the operator must move TO, by name. Without it the
           sentence can only say "its configured destination" and the operator
           has to go and look it up — which is the message doing half its job. */
        destination: destById.get(collection.fixedDestinationId)?.name ?? null,
      });
    }

    const byLine = new Map<string, BatchLineDecision>();
    for (const d of decision?.lineDecisions ?? []) {
      if (byLine.has(d.sku)) return refuse(c, 422, "duplicate_cost_decision", { sku: d.sku });
      byLine.set(d.sku, d);
    }
    const lines: Record<string, unknown>[] = [];
    for (const line of composedDoc.lines) {
      const d = byLine.get(line.sku);
      /**
       * ⭐ NO DECISION IS NOT A CATALOG PRICE (0380; closure §3).
       *
       * The server used to fill an unpriced line from Catalog and send it back
       * as `cost_source: catalog`, so the database compared its own live value
       * against itself and agreed every time — a supplier price that moved
       * between review and Issue was adopted with nobody's approval. There is
       * no such fallback now: a line nobody checked is a line nobody may buy.
       */
      const sources = line.sources.map((src) => ({
        order_id: src.orderId,
        so: src.so,
        order_line_id: src.orderLineId,
        qty: src.qty,
      }));
      const liveCost = res.data.catalog.get(line.sku)?.cost ?? null;
      /* Issue review is not a cost-maintenance screen. With no legacy
         exception declaration, Catalog is the only commercial input; SQL
         rechecks the same live value inside the creation transaction. */
      if (!d) {
        const facts = { sku: line.sku, supplier: group.proposal.supplierName ?? null };
        if (liveCost == null || liveCost <= 0) return refuse(c, 422, "cost_required", facts);
        lines.push({
          sku: line.sku,
          qty: line.qty,
          cost: liveCost,
          cost_source: "catalog",
          commercial_treatment: "normal",
          commercial_reason: null,
          expected_catalog_cost: liveCost,
          sources,
        });
        continue;
      }
      if (d.treatment === "free_of_charge") {
        lines.push({
          sku: line.sku,
          qty: line.qty,
          cost: 0,
          cost_source: "hand_entered",
          commercial_treatment: "free_of_charge",
          commercial_reason: d.reason.trim(),
          /* An exception carries no catalog expectation; 0380 asks the
             approval table instead. */
          expected_catalog_cost: null,
          sources,
        });
        continue;
      }
      if (d.costSource === "catalog") {
        /* A CATALOG PRICE THAT MOVED IS A COMMERCIAL DECISION, NOT A RETRY.
           Refused here for the words, and again in SQL for the authority
           (`purchasing_check_line_commercials`). */
        const facts = { sku: line.sku, supplier: group.proposal.supplierName ?? null };
        /* CATALOG HAS NO PRICE is a configuration hole, not a price that moved,
           and the two need different acts. */
        if (liveCost == null || liveCost <= 0) return refuse(c, 422, "cost_required", facts);
        /* Nothing declared means nothing reviewed. */
        if (d.expectedCatalogCost == null) {
          return refuse(c, 422, "expected_cost_required", facts);
        }
        if (liveCost !== d.expectedCatalogCost || liveCost !== d.unitCost) {
          return refuse(c, 409, "supplier_price_changed", facts);
        }
        lines.push({
          sku: line.sku,
          qty: line.qty,
          /* THE STORED NUMBER IS THE SERVER'S OWN READ. The declaration only
             makes the comparison possible. */
          cost: liveCost,
          cost_source: "catalog",
          commercial_treatment: "normal",
          commercial_reason: null,
          expected_catalog_cost: d.expectedCatalogCost,
          sources,
        });
        continue;
      }
      /* A hand-entered price is an EXCEPTION. It travels as one, and 0380
         refuses it without a manager's approval on file. */
      lines.push({
        sku: line.sku,
        qty: line.qty,
        cost: d.unitCost,
        cost_source: "hand_entered",
        commercial_treatment: "normal",
        commercial_reason: null,
        expected_catalog_cost: null,
        sources,
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
      so_refs: soRefs,
      lines,
    });
    created.push({
      key: group.key,
      supplierId: group.proposal.supplierId,
      destinationId: group.destinationId,
    });
  }

  if (governedPos.length === 0) return refuse(c, 409, "nothing_to_issue");

  /* ── 7 · ONE TRANSACTION. A failure on the seventh document rolls back the
   * first six — including their commercial decisions, destinations and audit
   * history. There is no partial batch to clean up, because there is no
   * partial batch. */
  const { data: batch, error: batchErr } = await sb.rpc(
    "purchasing_issue_pos_batch",
    {
      p_pos: governedPos,
    },
  );
  if (batchErr) {
    /* ⭐ THE DATABASE'S OWN REFUSAL, IN THE OPERATOR'S WORDS. Every rule the
       RPC keeps (0379 duty · 0380 price and approval · 0382 lineage) raises
       with a machine-readable `detail`, and every one of those codes has words
       in `purchasingRefusal`. Without this the operator met a Postgres
       sentence, which is exactly the "Something went wrong" the copy standard
       forbids. */
    const detail = String((batchErr as { details?: string }).details ?? "").trim();
    const known = (PURCHASING_REFUSAL_CODES as readonly string[]).includes(detail);
    if (known) {
      const status =
        detail === "not_po_duty"
          ? 403
          : detail === "supplier_price_changed"
            ? 409
            : 422;
      /* ⭐ NAME THE PARTIES (YH, 2026-09-03). This forwarded the database's
         code with NO facts, so every batch refusal reached the operator as the
         factless fallback — "The supplier must be collected to its configured
         destination" — on a batch spanning suppliers, naming none of them and
         showing the error beside whichever document happened to be on screen.
         The route knows every document it just built, so it names the one the
         rule is about: the only supplier here whose governed destination is not
         the one it was issued to. When no single document answers, the facts
         stay empty and the honest fallback is what appears. */
      const facts: Parameters<typeof purchasingRefusal>[1] = {};
      const hint = (batchErr as { hint?: string }).hint;
      if (hint) {
        try {
          const named = JSON.parse(hint) as Record<string, unknown>;
          for (const k of ["supplier", "destination", "sku", "po"] as const) {
            const v = named[k];
            if (typeof v === "string" && v.trim() !== "") facts[k] = v;
          }
        } catch {
          /* A hint that is not the JSON we write is a hint from somewhere else.
             The refusal still leaves in the approved two lines, unnamed — which
             is what it did before this existed. */
        }
      }
      return refuse(c, status, detail, facts);
    }
    const m = mapPgError(batchErr);
    return c.json(m.body, m.status);
  }
  const ids = ((batch as { po_ids?: unknown } | null)?.po_ids ??
    []) as string[];
  if (ids.length !== governedPos.length) return refuse(c, 500, "po_not_created");

  /* ⭐ THE DOORS THE EVIDENCE STEP WILL NEED (closure §7).
   *
   * The operator now has to actually send each PDF, and the ONE communication
   * area asks the supplier's own group link and email. Reading them here — once,
   * for the suppliers just issued to — is what lets that surface offer the real
   * door instead of a generic `web.whatsapp.com` that opens nobody's chat.
   *
   * Best-effort: a supplier with nothing on file gets a named gap, and the
   * purchase orders exist either way. */
  const supplierIds = [...new Set(created.map((x) => x.supplierId))];
  const doorsBySupplier = new Map<
    string,
    { whatsappGroupUrl: string | null; contactEmail: string | null; contact: string | null }
  >();
  if (supplierIds.length > 0) {
    const { data: sups } = await sb
      .from("suppliers")
      .select("id, whatsapp_group_url, contact_email, contact")
      .in("id", supplierIds);
    for (const r of (sups ?? []) as Record<string, unknown>[]) {
      doorsBySupplier.set(r.id as string, {
        whatsappGroupUrl: (r.whatsapp_group_url as string | null) ?? null,
        contactEmail: (r.contact_email as string | null) ?? null,
        contact: (r.contact as string | null) ?? null,
      });
    }
  }

  return c.json({
    ok: true,
    /* The official identity, and the facts the evidence step needs to name and
       reach the document it is chasing. */
    pos: ids.map((id, i) => {
      const supplierId = created[i]!.supplierId;
      const doors = doorsBySupplier.get(supplierId);
      return {
        id,
        supplierId,
        supplierName: res.data.supplierNames.get(supplierId) ?? null,
        destinationId: created[i]!.destinationId,
        destination: destById.get(created[i]!.destinationId)?.name ?? null,
        whatsappGroupUrl: doors?.whatsappGroupUrl ?? null,
        contactEmail: doors?.contactEmail ?? null,
        contact: doors?.contact ?? null,
      };
    }),
  });
});

export default toOrderRouter;
