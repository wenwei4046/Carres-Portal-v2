import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import {
  composeDocumentLines,
  documentPartitionKey,
  poDeliveryDateOf,
  PURCHASING_REFUSAL_CODES,
  purchasingRefusal,
  stockMatchKey,
  railItemLabel,
  type DemandPickItem,
  type IssueDocument,
  type PoDocumentAllocation,
  type ToOrderBuild,
  type ToOrderRow,
} from "@carres/shared";
import { validateIssuePlan } from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { purchasingActorMayIssue } from "../../lib/purchasing-po-authority";
import { fail } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import {
  loadToOrder,
  readFreeStock,
  todayIso,
} from "../../lib/purchase-demand-read";
import type { AppEnv } from "../../types";

/**
 * /api/operation/purchase/to-order — the Planning Workspace.
 *
 *   GET  /demand/pick-items   what the Manual Purchase picker chooses from
 *   POST /issue-batch         the ONE act that creates formal purchase orders
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
  if (skuErr) return fail(c, skuErr);

  const { data: modelRows, error: modelErr } = await sb
    .from("product_models")
    .select("id, name");
  if (modelErr) return fail(c, modelErr);
  const modelName = new Map(
    (modelRows ?? []).map((m) => [m.id as string, (m.name as string) ?? ""]),
  );

  const { data: supRows, error: supErr } = await sb
    .from("suppliers")
    .select("id, name");
  if (supErr) return fail(c, supErr);
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
  if (authority.error) return fail(c, authority.error);
  if (!authority.mayIssue) {
    const actorRes = await sb.rpc("purchasing_po_actor");
    if (actorRes.error) return fail(c, actorRes.error);
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
  if (destRes.error) return fail(c, destRes.error);
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
    /* ⭐ 0430 — A RECEIPT IS NOT A BUY. T6 keeps a fully covered build VISIBLE
       (its qty states what the covering purchase order bought), and nothing
       here refused it — so re-issuing the same covered demand minted a fresh
       purchase order every time. Production carries the proof: six open POs,
       each sourcing the SAME 1-unit order line of SO-1340 (2026-09-04/05).
       The door now refuses the receipt BY NAME, whatever the screen showed. */
    if (hit.build.fullyOnPo) {
      return refuse(c, 422, "already_on_po", {
        po: hit.build.coveredByOpenPoPos?.[0] ?? null,
      });
    }
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
    if (partners.error || configured.error) return fail(c, partners.error ?? configured.error!);
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
        /**
         * ⭐ PRICE NOT RECORDED DOES NOT STOP THE ORDER — owner instruction
         * 2026-09-23, the same ruling Manual Purchase shipped under 0573, and
         * the gap MASTER §9.2 named on this lane.
         *
         * A SKU Carres has never been quoted for is issued carrying NO
         * commercial claim: no cost, no cost source, no treatment. That is the
         * one shape `purchase_order_lines`' own CHECK keeps for an absence, and
         * the door's `v_price_not_recorded` verdict skips the cost-source gate
         * and the approval engine for exactly that line — so it neither needs
         * nor spends an approval.
         *
         * ⛔ AND AN ABSENCE IS NOT A ZERO. A price that IS recorded but is not
         * positive is a Catalog mistake, not an unknown, and it keeps refusing
         * by name: filling it with RM0 would put a number nobody agreed on a
         * supplier's paper. Free of charge remains its own declared decision
         * with its own reason.
         */
        if (liveCost == null) {
          lines.push({
            sku: line.sku,
            qty: line.qty,
            cost: null,
            cost_source: null,
            commercial_treatment: null,
            commercial_reason: null,
            expected_catalog_cost: null,
            sources,
          });
          continue;
        }
        if (liveCost <= 0) return refuse(c, 422, "cost_required", facts);
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
           and the two need different acts.
           ⛔ THIS BRANCH IS NOT THE ABSENCE CASE (owner instruction 2026-09-23).
           A `catalog` decision means the operator REVIEWED a number — the
           schema requires a positive `unitCost` — so a line whose Catalog price
           has since gone is a review that no longer holds, not an unknown
           price. The absence path is the no-decision one above, where nobody
           claimed to have seen a figure. */
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
      /* ⭐ THE PO's OWN DELIVERY DATE — `PO Date + n Settings working days`,
         NO transit added (owner correction 2026-09-22, converged across both
         buying doors on 2026-09-23). `expectedArrivalOf` answers a DIFFERENT
         question — when the goods reach Carres, production PLUS the transit
         leg — and it stays the arrival-planning arithmetic behind `Order By`
         and the register's timing facts. Printing the arrival under a
         `PO {n}-Day` label was how a 13-day Settings number came to promise
         14 days on a supplier's paper.
 
         ⛔ WHAT THIS DOES NOT TOUCH: the customer arrival projection
         (`purchasing_project_line_etas`, which reads supplier dates and not
         this one) and every PO already issued — `official_delivery_date` is
         stamped once at birth and no UPDATE may move it (0428). */
      eta_date: poDeliveryDateOf(res.data.settings, {
        supplierId: group.proposal.supplierId,
        category: group.proposal.category,
        poDateIso: todayIso(),
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
    return fail(c, batchErr);
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
