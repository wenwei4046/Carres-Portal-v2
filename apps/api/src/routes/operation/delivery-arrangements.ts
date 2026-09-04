import { Hono } from "hono";
import {
  assignLogisticsInputSchema,
  deliveryWarehouseScheduleEvents,
  saveDeliveryArrangementInputSchema,
  signHandoverProofUploadInput,
  isLogisticsChange,
  type DeliveryScopeRef,
} from "@carres/shared";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { mapPgError } from "../../lib/route-helpers";
import { adminClient, userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * THE DELIVERY ARRANGEMENT DOORS (0379) — Delivery's own writes.
 *
 * Owner correction 2026-08-24 overwrites the earlier "Delivery Work writes
 * nothing" claim. Delivery owns the ARRANGEMENT: who carries a scope, on what
 * agreed day, in what window, with which proof of the partner's actual reply.
 * Sales Orders keeps the commercial promise and every customer-owned fact, and
 * NONE of them is writable through this file — `saveDeliveryArrangementInput`
 * simply has no field for them, so a hand-made request cannot smuggle one in.
 *
 * ```
 * GET  /                       every arrangement + its history (workspace read)
 * GET  /:orderId               one scope's arrangement, its history and the
 *                              read-only Sales facts Edit Delivery prints
 * POST /assign                 ONE partner onto one or many scopes, atomically
 * PUT  /:orderId               Save Delivery — the whole form for one scope
 * ```
 *
 * ── THE ONE RULE THIS FILE EXISTS TO ENFORCE ────────────────────────────────
 *
 *   "Never silently replace an existing Logistics Partner. Changing an existing
 *    Partner uses governed `Change logistics`, requiring reason and history."
 *
 * So every write runs the same three steps in ONE service-role transaction:
 * read the current partner → classify assign-vs-change (`isLogisticsChange`,
 * the SAME predicate the dialog runs, so the form cannot ask for something the
 * server does not require) → write the arrangement AND its history row
 * together. A change without a reason is refused with 409 and the scopes it
 * would have overwritten are NAMED, because "some of these already have a
 * carrier" is not an error an operator can act on.
 *
 * ── WHY SERVICE ROLE ────────────────────────────────────────────────────────
 *
 * 0379 gives these tables NO write policy at all (0366's shape). The history
 * row and the partner move must land together or not at all, and a client-side
 * UPDATE cannot promise that. The guard above still runs first: only Operation
 * or Principal reaches this file.
 */
const deliveryArrangementsRouter = new Hono<AppEnv>();

const ARRANGEMENT_SELECT =
  "id, order_id, leg, partner_id, confirmed_date, confirmed_time, expected_arrival, " +
  "logistics_note, reply_proof_path, driver_name, vehicle, condo_registration, updated_at, updated_by, " +
  "delivery_partners(id, name)";

type ArrangementRecord = {
  id: string;
  order_id: string;
  leg: number;
  partner_id: string | null;
  confirmed_date: string | null;
  confirmed_time: string | null;
  expected_arrival: string | null;
  logistics_note: string | null;
  reply_proof_path: string | null;
  driver_name: string | null;
  vehicle: string | null;
  condo_registration?: string | null;
  updated_at: string;
  updated_by: string | null;
  delivery_partners?: { id: string; name: string } | null;
};

const shape = (r: ArrangementRecord) => ({
  id: r.id,
  order_id: r.order_id,
  leg: r.leg,
  partner_id: r.partner_id,
  partner_name: r.delivery_partners?.name ?? null,
  confirmed_date: r.confirmed_date,
  confirmed_time: r.confirmed_time,
  /* `time` comes back as `14:30:00`; the form and the document both want
     `14:30`. Trimmed once here so no caller invents a second spelling. */
  expected_arrival: r.expected_arrival ? r.expected_arrival.slice(0, 5) : null,
  logistics_note: r.logistics_note,
  reply_proof_path: r.reply_proof_path,
  driver_name: r.driver_name,
  vehicle: r.vehicle,
  condo_registration: r.condo_registration ?? null,
  updated_at: r.updated_at,
  updated_by: r.updated_by,
});

/** Every arrangement — the workspace reads them all in one round trip. */
deliveryArrangementsRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.from("ops_delivery_arrangements").select(ARRANGEMENT_SELECT);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ arrangements: ((data ?? []) as unknown as ArrangementRecord[]).map(shape) });
});

/**
 * Delivery's read-only Warehouse Schedule feed.
 *
 * This is visibility, never a second Schedule or Work queue. Only whole-order
 * scopes are projected today: Stock's current allocation read binds exact
 * Units to the Sales Order but cannot yet bind one Unit to one split-trip DO,
 * so a leg projection would be invented truth.
 */
deliveryArrangementsRouter.get(
  "/warehouse-schedule",
  async (c) => {
    const auth = c.var.auth;
    const isInternal = auth.role === "operation" || auth.role === "principal";
    const isWarehouse = auth.role === "warehouse" && Boolean(auth.warehouseId);
    if (!isInternal && !isWarehouse) {
      return c.json({ error: "Warehouse Schedule is not available to this role" }, 403);
    }
    /* Warehouse has deliberately no direct table policy (0302), so its read
       uses admin only after the role+warehouse gate and is narrowed again by
       the permanent Unit's warehouse_id below. */
    const sb = isWarehouse
      ? adminClient(c.env)
      : userClient(c.env, auth.jwt);
    const arrangementsRes = await sb
      .from("ops_delivery_arrangements")
      .select(ARRANGEMENT_SELECT);
    if (arrangementsRes.error) {
      const m = mapPgError(arrangementsRes.error);
      return c.json(m.body, m.status);
    }

    const arrangements = (
      (arrangementsRes.data ?? []) as unknown as ArrangementRecord[]
    )
      .map(shape)
      .filter(
        (row) =>
          row.leg === 0 &&
          Boolean(row.confirmed_date) &&
          Boolean(row.partner_name),
      );
    if (arrangements.length === 0) return c.json({ events: [] });

    const orderIds = [...new Set(arrangements.map((row) => row.order_id))];
    const [ordersRes, deliveryOrdersRes] = await Promise.all([
      sb
        .from("orders")
        .select(
          "id, so, customer_address, delivered_at, do_file_path, pod_signature_url, placed_at, created_at",
        )
        .in("id", orderIds),
      sb
        .from("ops_delivery_orders")
        .select("id, order_id, do_number, trip_groups, voided_at")
        .in("order_id", orderIds),
    ]);
    const firstError = ordersRes.error ?? deliveryOrdersRes.error;
    if (firstError) {
      const m = mapPgError(firstError);
      return c.json(m.body, m.status);
    }

    type OrderFact = {
      id: string;
      so: number;
      customer_address: string | null;
      delivered_at: string | null;
      do_file_path: string | null;
      pod_signature_url: string | null;
      placed_at: string | null;
      created_at: string | null;
    };
    type DeliveryOrderFact = {
      id: string;
      order_id: string;
      do_number: string;
      trip_groups: string[] | null;
      voided_at: string | null;
    };

    const orders = (ordersRes.data ?? []) as OrderFact[];
    const orderById = new Map(orders.map((row) => [row.id, row]));
    const deliveryOrders = (
      (deliveryOrdersRes.data ?? []) as DeliveryOrderFact[]
    ).filter((row) => !row.voided_at);
    const doIds = deliveryOrders.map((row) => row.id);
    if (doIds.length === 0) return c.json({ events: [] });

    /* The DO's required exact Units come from the ONE recorded scope (0424,
       delivery_order_units) — never re-derived from reservation refs here.
       A document with no recorded scope (an old split trip) stays absent:
       absence is absence, never an invented Unit assignment. */
    const scopeRes = await sb
      .from("delivery_order_units")
      .select("delivery_order_id, item_id")
      .in("delivery_order_id", doIds);
    if (scopeRes.error) {
      const m = mapPgError(scopeRes.error);
      return c.json(m.body, m.status);
    }
    const scopeRows = (scopeRes.data ?? []) as Array<{
      delivery_order_id: string;
      item_id: string;
    }>;
    const itemIds = [...new Set(scopeRows.map((row) => row.item_id))];
    if (itemIds.length === 0) return c.json({ events: [] });

    const [unitsRes, prepRes, eventUnitsRes, handoversRes] = await Promise.all([
      sb
        .from("ops_stock_items")
        .select("id, unit_code, warehouse_id, sku")
        .in("id", itemIds),
      sb
        .from("delivery_unit_prep")
        .select("delivery_order_id, item_id, fact, recorded_at")
        .in("delivery_order_id", doIds),
      sb
        .from("delivery_handover_event_units")
        .select("delivery_order_id, item_id, event_id, recorded_side")
        .in("delivery_order_id", doIds),
      sb
        .from("delivery_handover_events")
        .select("id, delivery_order_id, kind, proof_path, recorded_at, receiver_name, recorded_by")
        .in("delivery_order_id", doIds),
    ]);
    const factsError =
      unitsRes.error ?? prepRes.error ?? eventUnitsRes.error ?? handoversRes.error;
    if (factsError) {
      const m = mapPgError(factsError);
      return c.json(m.body, m.status);
    }

    type UnitFact = {
      id: string;
      unit_code: string | null;
      warehouse_id: string | null;
      sku: string | null;
    };
    const units = ((unitsRes.data ?? []) as UnitFact[]).filter(
      (row) => !isWarehouse || row.warehouse_id === auth.warehouseId,
    );
    const unitById = new Map(units.map((row) => [row.id, row]));

    const warehouseIds = [
      ...new Set(
        units
          .map((row) => row.warehouse_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const skus = [
      ...new Set(units.map((row) => row.sku).filter((s): s is string => Boolean(s))),
    ];
    const [warehousesRes, skusRes] = await Promise.all([
      warehouseIds.length
        ? sb.from("warehouses").select("id, name").in("id", warehouseIds)
        : Promise.resolve({ data: [], error: null }),
      skus.length
        ? sb.from("product_skus").select("sku, variant").in("sku", skus)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const nameError = warehousesRes.error ?? skusRes.error;
    if (nameError) {
      const m = mapPgError(nameError);
      return c.json(m.body, m.status);
    }
    const warehouseName = new Map(
      ((warehousesRes.data ?? []) as Array<{ id: string; name: string }>).map(
        (row) => [row.id, row.name],
      ),
    );
    const productName = new Map(
      ((skusRes.data ?? []) as Array<{ sku: string; variant: string | null }>).map(
        (row) => [row.sku, row.variant],
      ),
    );

    const handovers = (handoversRes.data ?? []) as Array<{
      id: string;
      delivery_order_id: string;
      kind: string;
      proof_path: string | null;
      recorded_at: string;
      receiver_name: string | null;
      recorded_by: string | null;
    }>;
    const handoverById = new Map(handovers.map((row) => [row.id, row]));
    const recorderIds = [
      ...new Set(handovers.map((row) => row.recorded_by).filter(Boolean)),
    ] as string[];
    const recorderName = new Map<string, string>();
    if (recorderIds.length > 0) {
      const usersRes = await sb
        .from("app_users")
        .select("id, name, email")
        .in("id", recorderIds);
      if (usersRes.error) {
        const m = mapPgError(usersRes.error);
        return c.json(m.body, m.status);
      }
      for (const u of (usersRes.data ?? []) as Array<{
        id: string;
        name: string | null;
        email: string | null;
      }>) {
        recorderName.set(u.id, u.name || u.email || "");
      }
    }
    const prep = (prepRes.data ?? []) as Array<{
      delivery_order_id: string;
      item_id: string;
      fact: string;
      recorded_at: string;
    }>;
    const acceptedUnits = (
      (eventUnitsRes.data ?? []) as Array<{
        delivery_order_id: string;
        item_id: string;
        event_id: string;
        recorded_side: string;
      }>
    ).filter((row) => row.recorded_side === "warehouse");

    const events = arrangements.flatMap((arrangement) => {
      const order = orderById.get(arrangement.order_id);
      if (!order) return [];
      return deliveryOrders
        .filter((row) => row.order_id === arrangement.order_id)
        .flatMap((deliveryOrder) => {
          const doScope = scopeRows.filter(
            (row) => row.delivery_order_id === deliveryOrder.id,
          );
          return doScope.flatMap((scope) => {
        const unit = unitById.get(scope.item_id);
        if (!unit?.unit_code) return [];
        const prepAt = (fact: string) =>
          prep.find(
            (p) =>
              p.delivery_order_id === deliveryOrder.id &&
              p.item_id === scope.item_id &&
              p.fact === fact,
          )?.recorded_at ?? null;
        const accepted = acceptedUnits.find(
          (row) =>
            row.delivery_order_id === deliveryOrder.id &&
            row.item_id === scope.item_id,
        );
        const acceptedEvent = accepted
          ? handoverById.get(accepted.event_id)
          : undefined;
        return deliveryWarehouseScheduleEvents({
          unitId: unit.unit_code,
          deliveryOrderId: deliveryOrder.id,
          orderId: order.id,
          leg: arrangement.leg,
          so: order.so,
          fromLocation: unit.warehouse_id
            ? warehouseName.get(unit.warehouse_id) ?? "Not recorded"
            : "Not recorded",
          toCustomer: order.customer_address ?? "Not recorded",
          logisticsPartner: arrangement.partner_name as string,
          driverName: arrangement.driver_name,
          vehicle: arrangement.vehicle,
          doNumber: deliveryOrder.do_number,
          collectionDate: arrangement.confirmed_date as string,
          collectionWindow: arrangement.confirmed_time,
          customerHandoverDate: arrangement.confirmed_date,
          actualCollectionAt: acceptedEvent?.recorded_at ?? null,
          actualArrivalAt: order.delivered_at,
          hasCollectionEvidence: Boolean(acceptedEvent?.proof_path),
          hasDeliveryEvidence: Boolean(
            order.pod_signature_url || order.do_file_path,
          ),
          soDate: (order.placed_at ?? order.created_at)?.slice(0, 10) ?? null,
          sku: unit.sku,
          productName: unit.sku ? productName.get(unit.sku) ?? null : null,
          unitScannedAt: prepAt("scanned"),
          unitCheckedAt: prepAt("checked"),
          unitPackedAt: prepAt("packed"),
          unitHandedOverAt: acceptedEvent?.recorded_at ?? null,
          unitHasEvidence: accepted ? Boolean(acceptedEvent?.proof_path) : false,
          unitWarehouseOperator: acceptedEvent?.recorded_by
            ? recorderName.get(acceptedEvent.recorded_by) ?? null
            : null,
          unitDeliveryPerson: acceptedEvent?.receiver_name ?? null,
        });
          });
        });
    });
    return c.json({ events });
  },
);

/**
 * ONE scope, for Edit Delivery. Returns the arrangement, its carrier history
 * and the read-only Sales facts the left column prints — assembled here so the
 * form makes one request and cannot show a customer from one order beside an
 * arrangement from another.
 */
deliveryArrangementsRouter.get("/:orderId", requireOperationOrPrincipal, async (c) => {
  const orderId = c.req.param("orderId");
  const leg = Number(c.req.query("leg") ?? "0");
  if (!Number.isInteger(leg) || leg < 0 || leg > 20) {
    return c.json({ error: "Unknown delivery scope" }, 400);
  }
  const sb = userClient(c.env, c.var.auth.jwt);

  const [{ data: order, error: orderErr }, { data: rows, error: arrErr }] = await Promise.all([
    sb
      .from("orders")
      .select(
        "id, so, source_ref, customer_name, customer_phone, customer_emergency, customer_address, " +
          "customer_address_line1, customer_address_line2, customer_address_city, " +
          "customer_address_state, customer_address_postcode, delivery_date, delivery_date_tbd, " +
          "delivery_floor, delivery_has_lift, delivery_stops, do_number, " +
          "building_type:entry_data->fields->>building_type, " +
          "order_lines(id, sku, qty, attrs), delivery_partner_id, ops_assigned_logistic",
      )
      .eq("id", orderId)
      .maybeSingle(),
    sb.from("ops_delivery_arrangements").select(ARRANGEMENT_SELECT).eq("order_id", orderId).eq("leg", leg),
  ]);
  const firstError = orderErr ?? arrErr;
  if (firstError) {
    const m = mapPgError(firstError);
    return c.json(m.body, m.status);
  }
  if (!order) return c.json({ error: "Order not found" }, 404);

  const arrangement = ((rows ?? []) as unknown as ArrangementRecord[])[0] ?? null;

  let history: unknown[] = [];
  if (arrangement) {
    const { data: events, error: evErr } = await sb
      .from("ops_delivery_arrangement_events")
      .select(
        "id, arrangement_id, event, reason_key, note, recorded_by, recorded_at, " +
          "from_partner:delivery_partners!ops_delivery_arrangement_events_from_partner_id_fkey(name), " +
          "to_partner:delivery_partners!ops_delivery_arrangement_events_to_partner_id_fkey(name)",
      )
      .eq("arrangement_id", arrangement.id)
      .order("recorded_at", { ascending: false });
    if (evErr) {
      const m = mapPgError(evErr);
      return c.json(m.body, m.status);
    }
    history = (events ?? []).map((e) => {
      const row = e as unknown as Record<string, unknown> & {
        from_partner?: { name?: string | null } | null;
        to_partner?: { name?: string | null } | null;
      };
      return {
        id: row.id as string,
        arrangement_id: row.arrangement_id as string,
        event: row.event as "assigned" | "changed" | "cleared",
        from_partner_name: row.from_partner?.name ?? null,
        to_partner_name: row.to_partner?.name ?? null,
        reason_key: (row.reason_key as string | null) ?? null,
        note: (row.note as string | null) ?? null,
        recorded_by: (row.recorded_by as string | null) ?? null,
        recorded_by_name: null,
        recorded_at: row.recorded_at as string,
      };
    });
  }

  return c.json({ order, arrangement: arrangement ? shape(arrangement) : null, history });
});

/** The current partner on each named scope — arrangement first, order as fallback. */
async function currentPartners(
  sb: ReturnType<typeof adminClient>,
  scopes: DeliveryScopeRef[],
): Promise<Map<string, { arrangementId: string | null; partnerId: string | null }>> {
  const orderIds = [...new Set(scopes.map((s) => s.orderId))];
  const [{ data: arrangements }, { data: orders }] = await Promise.all([
    sb.from("ops_delivery_arrangements").select("id, order_id, leg, partner_id").in("order_id", orderIds),
    sb.from("orders").select("id, delivery_partner_id, ops_assigned_logistic").in("id", orderIds),
  ]);
  const byOrder = new Map(
    ((orders ?? []) as Array<{ id: string; delivery_partner_id: string | null; ops_assigned_logistic: string | null }>).map(
      (o) => [o.id, o.delivery_partner_id ?? o.ops_assigned_logistic ?? null],
    ),
  );
  const out = new Map<string, { arrangementId: string | null; partnerId: string | null }>();
  const arrRows = (arrangements ?? []) as Array<{
    id: string;
    order_id: string;
    leg: number;
    partner_id: string | null;
  }>;
  for (const s of scopes) {
    const key = `${s.orderId}#${s.leg}`;
    const existing = arrRows.find((a) => a.order_id === s.orderId && a.leg === s.leg);
    if (existing) {
      out.set(key, { arrangementId: existing.id, partnerId: existing.partner_id });
      continue;
    }
    /* NO ARRANGEMENT ROW YET. The whole-order scope inherits whatever Sales'
       own door already recorded, so the first Delivery write is correctly
       classified as a CHANGE rather than a first assignment — otherwise every
       carrier that arrived through Accept Proceed could be replaced without a
       reason exactly once, which is the hole the ruling closes. A Journey LEG
       inherits nothing: the order-level column was never that leg's carrier. */
    out.set(key, {
      arrangementId: null,
      partnerId: s.leg === 0 ? byOrder.get(s.orderId) ?? null : null,
    });
  }
  return out;
}

/**
 * ASSIGN LOGISTICS — one partner onto one or many scopes, in one transaction.
 *
 * Refuses the WHOLE request when any scope would be silently overwritten. All
 * or nothing is deliberate: a partly-applied assignment across eleven scopes is
 * a state the operator cannot read back off the screen.
 */
deliveryArrangementsRouter.post("/assign", requireOperationOrPrincipal, async (c) => {
  const parsed = assignLogisticsInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Assign logistics needs a partner and at least one scope" }, 400);
  }
  const { scopes, partnerId, reason, note } = parsed.data;
  const sb = adminClient(c.env);

  const { data: partner, error: partnerErr } = await sb
    .from("delivery_partners")
    .select("id, name")
    .eq("id", partnerId)
    .maybeSingle();
  if (partnerErr) {
    const m = mapPgError(partnerErr);
    return c.json(m.body, m.status);
  }
  if (!partner) return c.json({ error: "That logistics partner does not exist" }, 404);

  const current = await currentPartners(sb, scopes);

  /* THE GATE. A change needs its reason, and the refusal NAMES the scopes so
     the operator can see which of their eleven picks already had a carrier. */
  if (!reason) {
    const changing = scopes.filter((s) =>
      isLogisticsChange(current.get(`${s.orderId}#${s.leg}`)?.partnerId, partnerId),
    );
    if (changing.length > 0) {
      return c.json(
        {
          error: "Some of these already have a logistics partner",
          code: "change_needs_reason",
          scopes: changing,
        },
        409,
      );
    }
  }

  const userId = c.var.auth.id;
  const stamp = new Date().toISOString();
  const results: Array<{ orderId: string; leg: number; event: string }> = [];

  for (const s of scopes) {
    const key = `${s.orderId}#${s.leg}`;
    const before = current.get(key) ?? { arrangementId: null, partnerId: null };
    /* Nothing to say and nothing to write: re-picking the partner a scope
       already has is not an event, and recording it would fill the history with
       lines that describe no change. */
    if (before.partnerId === partnerId && before.arrangementId) continue;

    const { data: saved, error: upsertErr } = await sb
      .from("ops_delivery_arrangements")
      .upsert(
        { order_id: s.orderId, leg: s.leg, partner_id: partnerId, updated_at: stamp, updated_by: userId },
        { onConflict: "order_id,leg" },
      )
      .select("id")
      .single();
    if (upsertErr) {
      const m = mapPgError(upsertErr);
      return c.json(m.body, m.status);
    }

    const event = isLogisticsChange(before.partnerId, partnerId) ? "changed" : "assigned";
    const { error: evErr } = await sb.from("ops_delivery_arrangement_events").insert({
      arrangement_id: saved.id,
      order_id: s.orderId,
      leg: s.leg,
      event,
      from_partner_id: before.partnerId,
      to_partner_id: partnerId,
      reason_key: event === "changed" ? reason ?? null : null,
      note: note ?? null,
      recorded_by: userId,
    });
    if (evErr) {
      const m = mapPgError(evErr);
      return c.json(m.body, m.status);
    }
    results.push({ orderId: s.orderId, leg: s.leg, event });
  }

  return c.json({ assigned: results.length, partner: partner.name, results });
});

/**
 * SAVE DELIVERY — the Edit Delivery form for ONE scope.
 *
 * It records the ARRANGEMENT and nothing else. It never issues a Delivery
 * Order: the SYSTEM issues one when the governed gate becomes true
 * (`docs/delivery/MASTER.md` §3), so there is no Issue, no Release and no
 * Approve on this path — saving an arrangement is simply one of the facts that
 * gate reads.
 */
deliveryArrangementsRouter.put("/:orderId", requireOperationOrPrincipal, async (c) => {
  const orderId = c.req.param("orderId");
  const leg = Number(c.req.query("leg") ?? "0");
  if (!Number.isInteger(leg) || leg < 0 || leg > 20) {
    return c.json({ error: "Unknown delivery scope" }, 400);
  }
  const parsed = saveDeliveryArrangementInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "That delivery cannot be saved" }, 400);
  }
  const input = parsed.data;
  const sb = adminClient(c.env);

  const { data: order, error: orderErr } = await sb
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) {
    const m = mapPgError(orderErr);
    return c.json(m.body, m.status);
  }
  if (!order) return c.json({ error: "Order not found" }, 404);

  const current = await currentPartners(sb, [{ orderId, leg }]);
  const before = current.get(`${orderId}#${leg}`) ?? { arrangementId: null, partnerId: null };
  const nextPartner = input.partnerId ?? null;

  if (isLogisticsChange(before.partnerId, nextPartner) && !input.reason) {
    return c.json(
      {
        error: "Changing the logistics partner needs a reason",
        code: "change_needs_reason",
      },
      409,
    );
  }

  const userId = c.var.auth.id;
  const { data: saved, error: saveErr } = await sb
    .from("ops_delivery_arrangements")
    .upsert(
      {
        order_id: orderId,
        leg,
        partner_id: nextPartner,
        confirmed_date: input.confirmedDate ?? null,
        confirmed_time: input.confirmedTime ?? null,
        expected_arrival: input.expectedArrival ?? null,
        logistics_note: input.logisticsNote ?? null,
        reply_proof_path: input.replyProofPath ?? null,
        driver_name: input.driverName ?? null,
        vehicle: input.vehicle ?? null,
        condo_registration: input.condoRegistration ?? null,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      },
      { onConflict: "order_id,leg" },
    )
    .select(ARRANGEMENT_SELECT)
    .single();
  if (saveErr) {
    const m = mapPgError(saveErr);
    return c.json(m.body, m.status);
  }

  /* The carrier moved, so the history says so — in the same request that moved
     it. A partner change recorded nowhere is the defect this table exists for. */
  if (before.partnerId !== nextPartner) {
    const event = !nextPartner ? "cleared" : isLogisticsChange(before.partnerId, nextPartner) ? "changed" : "assigned";
    const { error: evErr } = await sb.from("ops_delivery_arrangement_events").insert({
      arrangement_id: (saved as unknown as ArrangementRecord).id,
      order_id: orderId,
      leg,
      event,
      from_partner_id: before.partnerId,
      to_partner_id: nextPartner,
      reason_key: event === "changed" ? input.reason ?? null : null,
      recorded_by: userId,
    });
    if (evErr) {
      const m = mapPgError(evErr);
      return c.json(m.body, m.status);
    }
  }

  return c.json({ arrangement: shape(saved as unknown as ArrangementRecord) });
});

/**
 * POST /:orderId/reply-proof/sign-upload?leg= — Delivery Card 05.
 *
 * The partner's ACTUAL reply (a WhatsApp screenshot) is the evidence the
 * arrangement law demands: prepared, copied, opened or sent never means
 * confirmed (`docs/delivery/MASTER.md` §2). This door signs an upload into the
 * private proof bucket under the arrangement's own key; the saved
 * `reply_proof_path` then rides `Save Delivery` like every other field. Same
 * photo family and limits as the handover proof (0363's door).
 */
deliveryArrangementsRouter.post(
  "/:orderId/reply-proof/sign-upload",
  requireOperationOrPrincipal,
  async (c) => {
    const sb = userClient(c.env, c.var.auth.jwt);
    const orderId = c.req.param("orderId");
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
      return c.json({ error: "not_found", message: "Order not found" }, 404);
    }
    const leg = Number(c.req.query("leg") ?? "0") || 0;

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_input", message: "Body must be valid JSON" }, 400);
    }
    const parsed = signHandoverProofUploadInput.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return c.json(
        {
          error: "invalid_input",
          message: issue?.message ?? "invalid input",
          field: issue?.path.join(".") ?? "unknown",
        },
        422,
      );
    }

    const { data: order, error } = await sb
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .maybeSingle();
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    if (!order) {
      return c.json({ error: "not_found", message: "Order not found" }, 404);
    }

    const ext =
      parsed.data.mimeType === "image/png"
        ? "png"
        : parsed.data.mimeType === "image/webp"
          ? "webp"
          : "jpg";
    const path = `arrangement/${orderId}/${leg}/${crypto.randomUUID()}-reply.${ext}`;
    const admin = adminClient(c.env);
    const { data, error: signErr } = await admin.storage
      .from("proof-of-delivery")
      .createSignedUploadUrl(path);
    if (signErr) {
      return c.json({ error: "sign_upload_failed", message: signErr.message }, 500);
    }
    return c.json({ token: data.token, path: data.path });
  },
);

/**
 * POST /:orderId/message-prepared?leg= — Delivery Card 05's deferred half (0412).
 *
 * Preparation is an ACTIVITY fact: the operator copied/opened the prepared
 * WhatsApp message for a partner. The SQL door appends the arrangement event
 * and the order_history line together and writes NO arrangement field —
 * prepared, copied, opened or sent never means confirmed (MASTER §2/§13).
 */
deliveryArrangementsRouter.post(
  "/:orderId/message-prepared",
  requireOperationOrPrincipal,
  async (c) => {
    const orderId = c.req.param("orderId");
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
      return c.json({ error: "not_found", message: "Order not found" }, 404);
    }
    const leg = Number(c.req.query("leg") ?? "0") || 0;

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_input", message: "Body must be valid JSON" }, 400);
    }
    const partnerId = (body as { partnerId?: unknown })?.partnerId;
    if (typeof partnerId !== "string" || !/^[0-9a-f-]{36}$/i.test(partnerId)) {
      return c.json(
        { error: "invalid_input", message: "partnerId must be a logistics partner id" },
        422,
      );
    }

    const sb = userClient(c.env, c.var.auth.jwt);
    const { error } = await sb.rpc("delivery_arrangement_message_prepared", {
      p_order_id: orderId,
      p_leg: leg,
      p_partner_id: partnerId,
    });
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    return c.json({ recorded: true });
  },
);

export default deliveryArrangementsRouter;
