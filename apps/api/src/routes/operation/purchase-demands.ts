import { Hono } from "hono";
import {
  myHolidaySet,
  purchaseDemandBlockerOf,
  purchaseDemandQuantities,
  purchaseDemandTimingOf,
  soBatchAction,
  soBatchOrderLineOutstandingQty,
  soBatchOrderStatusOf,
  PURCHASE_DEMAND_OWNER_DUTY,
  type ProductCategory,
  type PurchaseDemandRow,
  type PurchaseDemandState,
  type PurchasingDestination,
  type SoBatchOrderLineFact,
  type SoBatchOrderPoFact,
  type SoBatchOrderRow,
  type SoBatchPurchaseResponse,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import {
  chunk,
  loadToOrder,
  type RegisterFacts,
  type RegisterOrderFact,
} from "../../lib/purchase-demand-read";
import { mapPgError } from "../../lib/route-helpers";
import { purchasingActorMayIssue } from "../../lib/purchasing-po-authority";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/operation/purchase/demands — the SO BATCH PURCHASE projection
 * (CARD-2026-08-22-purchasing-02; `docs/purchasing/MASTER.md` §§5.1, 9.1).
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

/**
 * ⭐ CARD 02-B — ONE ROW PER PROCEEDED SALES ORDER (owner ruling 2026-08-27;
 * `docs/purchasing/MASTER.md` §9.1).
 *
 * The permanent purchasing Register: every `proceed_order` Sales Order with
 * physical-goods demand stays visible after PO issue, forever. Three reads
 * compose it, and every one of them is an AUTHORITY, never an inference:
 *
 *   `po_line_sources`   the ONLY visible PO attribution (0382). Never
 *                       `purchase_orders.so`, never `so_refs`, never a global
 *                       SKU/supplier/customer match.
 *   `purchase_orders`   status (a cancelled PO never counts), the CURRENT
 *                       version, the official `eta_date`, the issued
 *                       supplier and `Deliver To`.
 *   `po_sends`          confirmed-sent evidence AT the current version
 *                       (0377/0378). `external_open` never counts; supplier
 *                       silence changes nothing; an older version's send does
 *                       not complete a new revision.
 *
 * Status is `soBatchOrderStatusOf` over two totals in SKU units, per order
 * line: what genuinely requires purchasing (`qty − stockTaken`, off the
 * engine's own pass) against what a qualifying PO's lineage covers. A
 * numbered unsent PO therefore shows under `PO No` while Status stays blank.
 *
 * These reads may NOT fail soft: a Register whose lineage read silently
 * returned nothing would print blank Status on ordered Sales Orders — a lie,
 * not a degraded page — so an error here is the route's error.
 */
async function loadRegisterRows(
  sb: ReturnType<typeof userClient>,
  facts: RegisterFacts,
  supplierNames: Map<string, string>,
): Promise<
  { ok: true; registerRows: SoBatchOrderRow[] } | { ok: false; status: number; body: unknown }
> {
  /* Which orders get a row: proceeded, with at least one demand line — the
     engine's procurable lines, or a refusal the leaf Register names (a
     `no_sku` line keeps its order visible without holding Status open). A
     Service-only order produces neither and stays outside Purchasing. */
  const withDemand = new Set<string>();
  for (const l of facts.soLines) withDemand.add(l.orderId);
  for (const l of facts.lines) withDemand.add(l.orderId);
  const orderIds = [...facts.ordersById]
    .filter(([id, o]) => o.status === "proceed_order" && withDemand.has(id))
    .map(([id]) => id);
  if (orderIds.length === 0) return { ok: true, registerRows: [] };

  /* ── the lineage ──────────────────────────────────────────────────────── */
  type LineageRow = {
    id: string;
    po_id: string;
    order_id: string;
    order_line_id: string | null;
    qty: number;
  };
  const lineage = new Map<string, LineageRow>();
  for (const batch of chunk(orderIds)) {
    const { data, error } = await sb
      .from("po_line_sources")
      .select("id, po_id, order_id, order_line_id, qty")
      .in("order_id", batch);
    if (error) {
      const m = mapPgError(error);
      return { ok: false, status: m.status, body: m.body };
    }
    // Keyed by row id: a chunked read must never count one unit twice.
    for (const r of (data ?? []) as LineageRow[]) lineage.set(r.id, r);
  }

  /* ── the documents behind it ──────────────────────────────────────────── */
  const poIds = [...new Set([...lineage.values()].map((r) => r.po_id))];
  type PoRow = {
    id: string;
    status: string;
    version: number | null;
    eta_date: string | null;
    supplier_id: string | null;
    destination_id: string | null;
  };
  const poById = new Map<string, PoRow>();
  const sentVersions = new Set<string>();
  for (const batch of chunk(poIds)) {
    if (batch.length === 0) continue;
    const [pos, sends] = await Promise.all([
      sb
        .from("purchase_orders")
        .select("id, status, version, eta_date, supplier_id, destination_id")
        .in("id", batch),
      sb.from("po_sends").select("po_id, po_version, kind").eq("kind", "confirmed_sent").in("po_id", batch),
    ]);
    const err = pos.error ?? sends.error;
    if (err) {
      const m = mapPgError(err);
      return { ok: false, status: m.status, body: m.body };
    }
    for (const p of (pos.data ?? []) as PoRow[]) poById.set(p.id, p);
    for (const s of (sends.data ?? []) as Record<string, unknown>[]) {
      // SQL already filtered; the guard keeps a permissive test double honest.
      if (s.kind != null && s.kind !== "confirmed_sent") continue;
      if (s.po_version == null) continue;
      sentVersions.add(`${s.po_id as string}::${Number(s.po_version)}`);
    }
  }
  const qualifies = (po: PoRow | undefined): po is PoRow =>
    po != null && po.status !== "cancelled";
  const sentCurrent = (po: PoRow): boolean =>
    sentVersions.has(`${po.id}::${po.version ?? 1}`);

  /* ── one row per order ────────────────────────────────────────────────── */
  const linesByOrder = new Map<string, typeof facts.soLines>();
  for (const l of facts.soLines) {
    const arr = linesByOrder.get(l.orderId);
    if (arr) arr.push(l);
    else linesByOrder.set(l.orderId, [l]);
  }
  const lineageByOrder = new Map<string, LineageRow[]>();
  for (const r of lineage.values()) {
    const arr = lineageByOrder.get(r.order_id);
    if (arr) arr.push(r);
    else lineageByOrder.set(r.order_id, [r]);
  }

  const registerRows: SoBatchOrderRow[] = [];
  for (const orderId of orderIds) {
    const fact = facts.ordersById.get(orderId)!;
    const soLines = linesByOrder.get(orderId) ?? [];
    const orderLineage = (lineageByOrder.get(orderId) ?? []).filter((r) =>
      qualifies(poById.get(r.po_id)),
    );

    /* Per order line: which POs, and how many units each. */
    const lineagePerLine = new Map<string, Map<string, number>>();
    for (const r of orderLineage) {
      if (!r.order_line_id) continue;
      let per = lineagePerLine.get(r.order_line_id);
      if (!per) {
        per = new Map();
        lineagePerLine.set(r.order_line_id, per);
      }
      per.set(r.po_id, (per.get(r.po_id) ?? 0) + Math.max(0, Number(r.qty ?? 0)));
    }

    let buyingRequiredQty = 0;
    let sentCoveredQty = 0;
    const outstandingSupplierIds = new Set<string>();
    const lines: SoBatchOrderLineFact[] = soLines.map((l) => {
      const per = lineagePerLine.get(l.lineId) ?? new Map<string, number>();
      const pos = [...per]
        .map(([poId, qty]) => ({ poId, qty }))
        .sort((a, b) => a.poId.localeCompare(b.poId));
      const required = Math.max(0, l.qty - l.stockTaken);
      const sent = pos.reduce(
        (s, p) => (sentCurrent(poById.get(p.poId)!) ? s + p.qty : s),
        0,
      );
      buyingRequiredQty += required;
      sentCoveredQty += Math.min(required, sent);
      const lineFact: SoBatchOrderLineFact = {
        orderLineId: l.lineId,
        sku: l.sku,
        qty: l.qty,
        stockTaken: l.stockTaken,
        item: l.modelName ?? l.sku,
        variant: l.variant,
        category: (l.category as ProductCategory | null) ?? null,
        pos,
      };
      if (soBatchOrderLineOutstandingQty(lineFact) > 0 && l.supplierId) {
        outstandingSupplierIds.add(l.supplierId);
      }
      return lineFact;
    });
    lines.sort((a, b) => a.sku.localeCompare(b.sku) || a.orderLineId.localeCompare(b.orderLineId));

    const pos: SoBatchOrderPoFact[] = [...new Set(orderLineage.map((r) => r.po_id))]
      .sort((a, b) => a.localeCompare(b))
      .map((poId) => {
        const po = poById.get(poId)!;
        return {
          poId,
          status: po.status === "received" ? "received" : "open",
          supplierId: po.supplier_id,
          supplierName: po.supplier_id
            ? (supplierNames.get(po.supplier_id) ?? null)
            : null,
          destinationId: po.destination_id,
          etaDate: po.eta_date?.slice(0, 10) ?? null,
          sentCurrentVersion: sentCurrent(po),
        };
      });

    registerRows.push({
      orderId,
      so: fact.so,
      customer: fact.customer,
      status: soBatchOrderStatusOf({ buyingRequiredQty, sentCoveredQty }),
      proceededAt: fact.proceededAt,
      requestedDeliveryDate: fact.delivery,
      deliveryCity: fact.city,
      deliveryState: fact.state,
      pos,
      lines,
      outstandingSuppliers: [...outstandingSupplierIds]
        .map((id) => supplierNames.get(id))
        .filter((n): n is string => Boolean(n))
        .sort((a, b) => a.localeCompare(b)),
    });
  }

  /* Newest order first — the buying day starts at the top. Deterministic:
     ties (and orders with no number yet) fall back to the id. */
  registerRows.sort((a, b) => (b.so ?? -1) - (a.so ?? -1) || a.orderId.localeCompare(b.orderId));
  return { ok: true, registerRows };
}

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
  const me = c.var.auth.id;

  const res = await loadToOrder(sb);
  if (!res.ok) return c.json(res.body as Record<string, unknown>, res.status as 400);
  const { proposals, registerFacts, supplierNames, supplierKinds, catalog, today, settings } =
    res.data;
  /* The SAME holiday set the engine planned with — the classification only
     compares the engine's dates, it never re-plans them. */
  const holidays = myHolidaySet();

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
  let poDutyId: string | null = null;
  let actingId: string | null = null;
  let actingName: string | null = null;
  let poDutyUnavailable = false;
  let mayIssue = false;
  const nameById = new Map<string, string>();
  try {
    /* ⭐ ONE ACTOR RESOLVER (0379). This read used to ask `ops_po_duty` itself,
       which meant the Register knew nothing about buddy cover: a covering
       operator was shown a page with no Issue PO on it, and the door would have
       let them through. One resolver, one answer, on every surface. */
    const [actorRes, authorityRes, people] = await Promise.all([
      sb.rpc("purchasing_po_actor"),
      purchasingActorMayIssue(sb, me),
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
    if (authorityRes.error) {
      console.error("purchase demands — PO issue authority unavailable", authorityRes.error.message);
    } else {
      mayIssue = authorityRes.mayIssue;
    }
    if (actorRes.error) {
      poDutyUnavailable = true;
      console.error("purchase demands — PO duty unavailable", actorRes.error.message);
    } else {
      const actor = (actorRes.data ?? {}) as {
        normal_user_id?: string | null;
        acting_user_id?: string | null;
        actor_user_id?: string | null;
      };
      poDutyId = actor.normal_user_id ?? null;
      actingId = actor.acting_user_id ?? null;
      const wanted = [poDutyId, actingId].filter((v): v is string => v != null);
      if (wanted.length > 0) {
        const who = await sb
          .from("app_users")
          .select("id, name, email")
          .in("id", [...new Set(wanted)]);
        for (const u of (who.data ?? []) as Record<string, unknown>[]) {
          const l = label(u);
          if (!l) continue;
          if (u.id === poDutyId) poDutyName = l;
          if (u.id === actingId) actingName = l;
        }
      }
    }
  } catch (e) {
    poDutyUnavailable = true;
    console.error("purchase demands — owner names unavailable", (e as Error).message);
  }

  const orderFact = (orderId: string): RegisterOrderFact =>
    registerFacts.ordersById.get(orderId) ?? {
      so: null,
      customer: null,
      delivery: null,
      salespersonId: null,
      status: null,
      proceededAt: null,
      city: null,
      state: null,
    };

  const rows: PurchaseDemandRow[] = [];

  /* Factory collection is governed supplier master data. The buying screen
     carries the resolved fact so Review can state it; it never offers an
     ad-hoc collector choice. */
  const collectionBySupplier = new Map<
    string,
    {
      procurementPartnerId: string;
      procurementPartnerName: string;
      fixedDestinationId: string | null;
    }
  >();
  try {
    const [configured, partners] = await Promise.all([
      sb
        .from("purchasing_supplier_settings")
        .select("supplier_id, fixed_destination_id, collected_by_partner_id"),
      sb.from("delivery_partners").select("id, name"),
    ]);
    if (configured.error || partners.error) {
      const m = mapPgError(configured.error ?? partners.error!);
      return c.json(m.body, m.status);
    }
    const partnerNames = new Map(
      ((partners.data ?? []) as Record<string, unknown>[]).map((p) => [
        p.id as string,
        (p.name as string) ?? "",
      ]),
    );
    for (const setting of (configured.data ?? []) as Record<string, unknown>[]) {
      const partnerId = setting.collected_by_partner_id as string | null;
      const partnerName = partnerId ? partnerNames.get(partnerId) : null;
      if (!partnerId || !partnerName) continue;
      collectionBySupplier.set(setting.supplier_id as string, {
        procurementPartnerId: partnerId,
        procurementPartnerName: partnerName,
        fixedDestinationId: (setting.fixed_destination_id as string | null) ?? null,
      });
    }
  } catch (e) {
    console.error("so batch — supplier collection rules unavailable", (e as Error).message);
  }

  /* ── 1 · the demand the engine CARRIED ──────────────────────────────────── */
  for (const proposal of proposals) {
    for (const row of proposal.rows) {
      // A typed Ready Stock demand is not a CUSTOMER demand. It left this
      // engine with CARD-2026-08-18-manual-purchase and has its own page; the
      // guard costs nothing and keeps the boundary explicit.
      if (row.readyStock) continue;
      for (const build of row.builds) {
        /* A FULLY COVERED build does not remain in SO Batch Purchase (Card
           02-A §3): it is found through Purchase Orders, Stock and Order
           Route. The engine reads `status = 'open'` and nothing else, so the
           moment that purchase order is cancelled the coverage falls away and
           the demand returns here by recomputation — nothing is stored. */
        if (build.fullyOnPo === true) continue;
        const q = purchaseDemandQuantities(build, proposal.category);
        /* THE ENGINE'S OWN ARRIVAL DATE. `stockReady` IS `arriveBy` — the day
           the goods must be at Carres for this customer promise to hold. */
        const goodsMustArrive = row.stockReady;
        const catalogCostMissing = build.lines.some((l) => {
          const cost = catalog.get(l.sku)?.cost ?? null;
          return cost == null || cost <= 0;
        });
        /* A carried build has its SKU, supplier and production days by
           construction — the read refuses the others line by line into
           `registerFacts` below. The one blocker it can still carry is the
           missing customer date. */
        const state: PurchaseDemandState =
          row.delivery == null
            ? "no_customer_date"
            : catalogCostMissing
              ? "no_cost"
            : build.readyIfOrderedToday != null
              ? purchaseDemandTimingOf({
                  today,
                  orderBy: build.orderBy ?? null,
                  readyIfOrderedToday: build.readyIfOrderedToday,
                  customerDelivery: row.delivery,
                  safetyDays: settings.orderByBufferDays,
                  holidays,
                })
              : /* The engine planned this build but gave it no dates — a pair
                   whose production facts went missing mid-read. Fail safely at
                   the Purchasing-owned boundary: `SETUP TO FIX` names it, and
                   nothing silently defaults an order timing. */
                "no_production_days";
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
          goodsMustArrive,
          /* A CARRIED build can be issued, so it carries the reference the
             issue endpoint recomputes against. A refused line below cannot,
             and says so by having none. */
          issueRef: state === "no_cost"
            ? null
            : { proposalKey: proposal.key, buildKey: build.key },
          /* The CATALOG's price per SKU, carried so the 50/50 can ask for the
             one it does not have. `null` is load-bearing: a SKU with no price
             cannot be issued until somebody states a cost or marks it Free of
             Charge, and a `0` here would be a price nobody set. */
          /* The build's own lines — the modules a matched set is made of. The
             quantity rides with them, so the expand can list the parts instead
             of re-stating the row's numbers. */
          parts: build.lines.map((l) => ({
            sku: l.sku,
            qty: l.qty,
            unitCost: catalog.get(l.sku)?.cost ?? null,
          })),
          supplierKind: supplierKinds.get(proposal.supplierId) ?? "own_logistics",
          supplierCollection: collectionBySupplier.get(proposal.supplierId) ?? null,
          action: soBatchAction({
            state,
            item: build.model,
            supplier: proposal.supplierName,
            category: proposal.category,
            ownerId:
              state === "no_customer_date" ? (fact.salespersonId ?? null) : poDutyId,
            ownerName:
              state === "no_customer_date"
                ? (nameById.get(fact.salespersonId ?? "") ?? null)
                : poDutyName,
            orderId: row.orderId,
            so: row.so,
            dueDate: goodsMustArrive,
          }),
          ...ownerOf(state, nameById.get(fact.salespersonId ?? "") ?? null),
        });
      }
    }
  }

  /* ── 2 · the demand the engine REFUSED ──────────────────────────────────── */
  for (const line of registerFacts.lines) {
    /* A line fully covered from ready stock has `Buy = 0`, and `Buy = 0`
       lines do not remain in SO Batch Purchase (Card 02-A §3). */
    if (line.refusal === "covered_by_stock") continue;
    const fact = orderFact(line.orderId);
    const state =
      purchaseDemandBlockerOf({
        inCatalog: line.refusal !== "no_sku",
        hasSupplier: line.refusal !== "no_supplier",
        hasProductionDays: line.refusal !== "no_production_days",
        hasCustomerDate: fact.delivery != null,
      }) ??
      /* The engine refused the line, so a blocker must exist; if the refusal
         reason is one this projection does not know, fail safely at the
         Purchasing-owned boundary rather than inventing an order timing. */
      "no_production_days";
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
      // A refusal blocks the allocation too, so there is no coverage answer —
      // see this file's header.
      readyStock: null,
      takenFromStock: null,
      onPo: null,
      poNumbers: [],
      toBuy: null,
      /* The engine refused this line, so there is no build and no plan — and
         therefore no arrival date and nothing to issue. Inventing either would
         offer an act that cannot succeed. */
      goodsMustArrive: null,
      issueRef: null,
      parts: [{ sku: line.sku, qty: line.qty, unitCost: catalog.get(line.sku)?.cost ?? null }],
      supplierKind: line.supplierId
        ? (supplierKinds.get(line.supplierId) ?? "own_logistics")
        : null,
      supplierCollection: line.supplierId
        ? (collectionBySupplier.get(line.supplierId) ?? null)
        : null,
      action: soBatchAction({
        state,
        item: line.modelName ?? line.sku,
        supplier: line.supplierId ? (supplierNames.get(line.supplierId) ?? null) : null,
        category: (line.category as ProductCategory | null) ?? null,
        ownerId: state === "no_customer_date" ? (fact.salespersonId ?? null) : poDutyId,
        ownerName:
          state === "no_customer_date"
            ? (nameById.get(fact.salespersonId ?? "") ?? null)
            : poDutyName,
        orderId: line.orderId,
        so: fact.so,
        dueDate: null,
      }),
      ...ownerOf(
        state,
        state === "no_customer_date"
          ? (nameById.get(fact.salespersonId ?? "") ?? null)
          : poDutyName,
      ),
    });
  }

  /* ── 3 · Card 02-B — one permanent row per proceeded Sales Order ────────── */
  const registerRes = await loadRegisterRows(sb, registerFacts, supplierNames);
  if (!registerRes.ok) {
    return c.json(registerRes.body as Record<string, unknown>, registerRes.status as 400);
  }

  /* ── 4 · where a buy may be sent ────────────────────────────────────────
   *
   * A CLOSED destination is still returned. History reads through this list —
   * a purchase order sent to a yard that shut last month must still be able to
   * print where it went — and `active` is what stops it being CHOSEN again.
   * Filtering it out here would make an old document unreadable. */
  let destinations: PurchasingDestination[] = [];
  try {
    const dest = await sb
      .from("purchasing_destinations")
      .select("id, name, is_default, active")
      .order("name");
    destinations = ((dest.data ?? []) as Record<string, unknown>[]).map((d) => ({
      id: d.id as string,
      name: (d.name as string) ?? "",
      isDefault: d.is_default === true,
      active: d.active !== false,
    }));
  } catch (e) {
    console.error("so batch — destinations unavailable", (e as Error).message);
  }
  const defaultDestination = destinations.find((d) => d.isDefault && d.active) ?? null;

  /* WHO MAY COLLECT FROM A FACTORY. Read here rather than on the issue POST so
     the operator can choose one while checking the document, instead of being
     told `pickup_partner_required` after pressing Issue PO. */
  let procurementPartners: { id: string; name: string }[] = [];
  try {
    const partners = await sb.from("delivery_partners").select("id, name").order("name");
    procurementPartners = ((partners.data ?? []) as Record<string, unknown>[]).map((p) => ({
      id: p.id as string,
      name: (p.name as string) ?? "",
    }));
  } catch (e) {
    console.error("so batch — procurement partners unavailable", (e as Error).message);
  }

  const body: SoBatchPurchaseResponse = {
    today,
    rows,
    registerRows: registerRes.registerRows,
    destinations,
    /* No default configured means NO default. Picking the first active one
       would silently make some warehouse the standing answer, and the standing
       answer is a governed Purchasing setting (MASTER §5.4). */
    defaultDestinationId: defaultDestination?.id ?? null,
    currentPoDuty: poDutyId && poDutyName ? { userId: poDutyId, name: poDutyName } : null,
    actingPoDuty: actingId && actingName ? { userId: actingId, name: actingName } : null,
    /* An unresolved name must not erase a real configured duty/cover fact.
       The dated cover is the effective person today; otherwise it is the
       normal holder. Only no effective ID means nobody holds the duty. */
    poDutyNameUnavailable:
      (actingId ?? poDutyId) != null && (actingId != null ? actingName : poDutyName) == null,
    poDutyUnavailable,
    /* Convenience only. The browser, issue routes and SQL ask the same governed
       capability. Duty/cover remains the owner fact; a superuser is not
       relabelled as that owner. */
    mayIssue,
    procurementPartners,
    /* Card 02-A — the governed Safety days value, so the rail words follow
       the one setting. The browser prints it; the arithmetic stayed here. */
    safetyDays: settings.orderByBufferDays,
  };
  return c.json(body);
});

export default purchaseDemandsRouter;
