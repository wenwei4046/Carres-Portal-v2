import { Hono } from "hono";
import {
  buildReceivingRegister,
  historicalReceivingLineInput,
  warehouseReceiptOpensClaims,
  warehouseReceiptSummary,
  warehouseReceiptReturnInput,
  receivingMutationVersionInput,
  receivingSessionInputSchema,
  receivingSessionSaveInput,
  type ReceivingLineInput,
  type ReceivingRegisterFilter,
  type ReceivingRegisterSource,
  type ReceivingRegisterPromise,
  type ReceivingRegisterSession,
  type WarehouseReceiptLine,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { adminClient, userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";
import { autoReserveReceivedToSourceOrder } from "./pos";

/**
 * /api/operation/warehouse-receipts — the governed Receiving Session door.
 *
 * Every door saves, submits, returns or posts the same durable session. Check-in
 * calls the single posting engine; it never rebuilds a second payload and never
 * writes stock itself. Damaged, wrong and extra outcomes remain visible facts —
 * posting does not silently turn them into supplier claims.
 *
 * Role: operation + principal, matching the Receiving station this queue lives
 * on. The RPCs gate on `is_operation()` independently — defence in depth, not
 * the only lock.
 */
const warehouseReceiptsRouter = new Hono<AppEnv>();

const DEFAULT_LIMIT = 200;
/** Long enough to open the paper, short enough that a copied link dies. */
const SIGNED_URL_TTL_SECONDS = 3600;

type ReceiptRow = Record<string, unknown>;

type RegisterReadError = { code?: string; message?: string; details?: string };
type RegisterPagedRead<T> = {
  range: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: RegisterReadError | null;
  }>;
};

async function readRegisterRows<T>(query: RegisterPagedRead<T>) {
  const data: T[] = [];
  for (let from = 0; ; from += 1_000) {
    const result = await query.range(from, from + 999);
    if (result.error) return { data: [] as T[], error: result.error };
    const page = result.data ?? [];
    data.push(...page);
    if (page.length < 1_000) return { data, error: null };
  }
}

function todayInMalaysia(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function registerLine(raw: Record<string, unknown>): ReceivingLineInput {
  if ("poLineId" in raw) {
    return {
      poLineId: String(raw.poLineId ?? ""),
      sku: String(raw.sku ?? ""),
      receivedQty: Number(raw.receivedQty ?? 0),
      damagedQty: Number(raw.damagedQty ?? 0),
      wrongItemQty: Number(raw.wrongItemQty ?? 0),
      extraQty: Number(raw.extraQty ?? 0),
      unitIds: Array.isArray(raw.unitIds) ? raw.unitIds.map(String) : [],
      damagedPhotos: [],
      wrongItemPhotos: [],
      extraEvidence: [],
      wrongItemReason: null,
    };
  }
  return historicalReceivingLineInput(raw as unknown as WarehouseReceiptLine);
}

warehouseReceiptsRouter.get("/register", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const exactSource = c.req.query("source")?.trim() || null;
  let sourceQuery = sb.from("purchase_orders")
    .select("id, version, placed_at, po_delivery_date, supplier_id, destination_id, status, suppliers(name)");
  sourceQuery = exactSource
    ? sourceQuery.eq("id", exactSource)
    : sourceQuery.eq("status", "open");
  const sourceRows = await readRegisterRows<Record<string, unknown>>(
    sourceQuery
      .order("po_delivery_date", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true }),
  );
  if (sourceRows.error) {
    const mapped = mapPgError(sourceRows.error);
    return c.json(mapped.body, mapped.status);
  }
  const sourceIds = sourceRows.data.map((row) => String(row.id));
  if (sourceIds.length === 0) {
    return c.json(buildReceivingRegister({
      today: todayInMalaysia(),
      filter: c.req.query("date") as ReceivingRegisterFilter | undefined,
      sources: [], supplierPromises: [], sessions: [],
    }));
  }

  const [lineRows, destinationRows, promiseRows, sessionRows] = await Promise.all([
    readRegisterRows<Record<string, unknown>>(
      sb.from("purchase_order_lines")
        .select("id, po_id, sku, qty, received_qty")
        .in("po_id", sourceIds)
        .order("po_id")
        .order("id"),
    ),
    readRegisterRows<Record<string, unknown>>(
      sb.from("purchasing_destinations")
        .select("id, name")
        .in("id", sourceRows.data.map((row) => String(row.destination_id)).filter(Boolean))
        .order("name"),
    ),
    readRegisterRows<Record<string, unknown>>(
      sb.from("po_supplier_promises")
        .select("po_id, new_date, about_date, recorded_at")
        .in("po_id", sourceIds)
        .eq("kind", "tomorrow_delivery")
        .order("recorded_at", { ascending: false }),
    ),
    readRegisterRows<Record<string, unknown>>(
      sb.from("warehouse_receipts")
        .select("id, source_id, po_id, grn_number, goods_received_timestamp, goods_received_at, do_number, lines")
        .in("source_id", sourceIds)
        .order("goods_received_timestamp", { ascending: false, nullsFirst: false }),
    ),
  ]);
  const failed = [lineRows, destinationRows, promiseRows, sessionRows]
    .find((result) => result.error)?.error;
  if (failed) {
    const mapped = mapPgError(failed);
    return c.json(mapped.body, mapped.status);
  }

  const linesBySource = new Map<string, Record<string, unknown>[]>();
  for (const line of lineRows.data) {
    const sourceId = String(line.po_id);
    const rows = linesBySource.get(sourceId) ?? [];
    rows.push(line);
    linesBySource.set(sourceId, rows);
  }
  const destinationById = new Map(
    destinationRows.data.map((row) => [String(row.id), String(row.name ?? "")]),
  );
  const sources: ReceivingRegisterSource[] = sourceRows.data.map((row) => {
    const supplier = Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers;
    return {
      id: String(row.id),
      kind: "purchase_order",
      version: Number(row.version ?? 1),
      issuedAt: typeof row.placed_at === "string" ? row.placed_at : null,
      supplier: String((supplier as { name?: unknown } | null)?.name ?? ""),
      deliverTo: destinationById.get(String(row.destination_id)) ?? "",
      poDeliveryDate: typeof row.po_delivery_date === "string" ? row.po_delivery_date : null,
      lines: (linesBySource.get(String(row.id)) ?? []).map((line) => ({
        id: String(line.id),
        sku: String(line.sku ?? ""),
        orderQty: Number(line.qty ?? 0),
        receivedQty: Number(line.received_qty ?? 0),
      })),
    };
  });
  const supplierPromises: ReceivingRegisterPromise[] = promiseRows.data.map((row) => ({
    sourceId: String(row.po_id),
    deliveryDate: typeof row.new_date === "string"
      ? row.new_date
      : typeof row.about_date === "string" ? row.about_date : null,
    recordedAt: String(row.recorded_at ?? ""),
  }));
  const sessions: ReceivingRegisterSession[] = sessionRows.data.map((row) => ({
    id: String(row.id),
    sourceId: String(row.source_id ?? row.po_id),
    grnNumber: typeof row.grn_number === "string" ? row.grn_number : null,
    goodsReceivedAt: typeof row.goods_received_timestamp === "string"
      ? row.goods_received_timestamp
      : typeof row.goods_received_at === "string" ? row.goods_received_at : null,
    supplierDoNo: typeof row.do_number === "string" ? row.do_number : null,
    lines: (Array.isArray(row.lines) ? row.lines : []).map((line) => {
      const value = registerLine(line as Record<string, unknown>);
      return {
        poLineId: value.poLineId,
        sku: value.sku,
        receivedQty: value.receivedQty,
        damagedQty: value.damagedQty,
        wrongItemQty: value.wrongItemQty,
        extraQty: value.extraQty,
        unitIds: value.unitIds,
      };
    }),
  }));
  return c.json(buildReceivingRegister({
    today: todayInMalaysia(),
    filter: c.req.query("date") as ReceivingRegisterFilter | undefined,
    sources,
    supplierPromises,
    sessions,
  }));
});

warehouseReceiptsRouter.post("/", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, receivingSessionInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("save_receiving_session", {
    p_receipt_id: null,
    p_expected_version: 0,
    p_payload: parsed.data,
  });
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json(data ?? {}, 201);
});

warehouseReceiptsRouter.patch("/:id", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, receivingSessionSaveInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("save_receiving_session", {
    p_receipt_id: c.req.param("id"),
    p_expected_version: parsed.data.expectedVersion,
    p_payload: parsed.data.session,
  });
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json(data ?? {});
});

warehouseReceiptsRouter.post("/:id/submit", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, receivingMutationVersionInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("submit_receiving_session", {
    p_receipt_id: c.req.param("id"),
    p_expected_version: parsed.data.expectedVersion,
  });
  if (error) {
    const mapped = mapPgError(error);
    return c.json(mapped.body, mapped.status);
  }
  return c.json(data ?? {});
});

/**
 * GET / — `?status=submitted|returned|posted|voided|all` (default `submitted`).
 *
 * Defaults to the OPEN queue for the same reason R3's claim list defaults to
 * open: this is a worklist, and a worklist that opens on settled rows is a
 * filing cabinet. Card C2 (2026-08-03) added the settled statuses, because the
 * SAME list now feeds the `Goods Received` register — a filing cabinet is
 * exactly what that queue is, and one list of Receiving Sessions beats two.
 *
 * `checked_in` is gone as a status word: 0314 renamed it to `posted` months
 * after this whitelist was written, so the old value filtered nothing and the
 * new one was unreachable.
 *
 * Names are resolved here rather than embedded in the row: a receipt snapshots
 * its warehouse id so the record of who counted survives a PO being relocated,
 * but a human reading the queue needs the name as it stands today.
 */
warehouseReceiptsRouter.get("/", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const raw = (c.req.query("status") ?? "submitted").toLowerCase();
  const status = (
    ["submitted", "returned", "posted", "voided", "all"] as const
  ).includes(raw as never)
    ? raw
    : "submitted";

  let q = sb
    .from("warehouse_receipts")
    .select(
      // C2 widened this: `submitted_from` · `goods_received_at` · `posted_*`
      // are what the Goods Received register reads, and they are 0314/0315
      // columns this select predates. `reviewed_*` stays until the
      // reader-rename slice drops it (0314's own discipline).
      "id, po_id, warehouse_id, do_number, do_file_path, note, lines, status, lock_version, submitted_from, goods_received_at, grn_number, submitted_by, submitted_at, posted_by, posted_at, reviewed_by, reviewed_at, return_reason",
    )
    // The register is a HISTORY, so it sorts by the BUSINESS date — when the
    // goods physically arrived — not by when somebody keyed them in. The
    // submitted stamp only breaks ties.
    .order("goods_received_at", { ascending: false })
    .order("submitted_at", { ascending: false })
    .limit(DEFAULT_LIMIT);
  if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const rows = (data ?? []) as ReceiptRow[];

  // The waiting count comes from its own head-count so the chip stays right
  // even when the visible page is capped at DEFAULT_LIMIT.
  const { count: waiting } = await sb
    .from("warehouse_receipts")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted");

  const warehouseIds = [
    ...new Set(rows.map((r) => r.warehouse_id as string).filter(Boolean)),
  ];
  const poIds = [...new Set(rows.map((r) => r.po_id as string).filter(Boolean))];
  const userIds = [
    ...new Set(
      rows
        .flatMap((r) => [r.submitted_by, r.reviewed_by, r.posted_by])
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  ];

  const warehouseNames = new Map<string, string>();
  if (warehouseIds.length > 0) {
    const { data: whs } = await sb
      .from("warehouses")
      .select("id, name")
      .in("id", warehouseIds);
    for (const w of whs ?? [])
      warehouseNames.set(w.id as string, w.name as string);
  }

  // The supplier is read through the PO rather than stored on the receipt: a
  // receipt is about goods arriving, and who they came from is the PO's fact.
  const supplierByPo = new Map<string, string | null>();
  if (poIds.length > 0) {
    const { data: pos } = await sb
      .from("purchase_orders")
      .select("id, supplier_id, suppliers(name)")
      .in("id", poIds);
    for (const p of (pos ?? []) as Array<Record<string, unknown>>) {
      const sup = p.suppliers as { name?: string } | null;
      supplierByPo.set(p.id as string, sup?.name ?? null);
    }
  }

  /**
   * The signed DO — a short-lived URL per row, batch-signed exactly the way
   * `supplier-claims` signs its claim photos. The signed DO IS the record's
   * evidence, so a register that cannot open it is a filing cabinet with the
   * paper removed. Signed only for the rows this page returns.
   */
  const doPaths = rows
    .map((r) => r.do_file_path as string | null)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  const doUrls = new Map<string, string>();
  if (doPaths.length > 0) {
    // Best-effort, and deliberately so: the register's job is to LIST the
    // records. If storage refuses to sign, the row still appears and its
    // record reads `Not on file` — a queue that 500s because one attachment
    // could not be signed would hide every delivery we ever took.
    try {
      const admin = adminClient(c.env);
      const { data: signed } = await admin.storage
        .from("delivery-orders")
        .createSignedUrls(doPaths, SIGNED_URL_TTL_SECONDS);
      for (const s of signed ?? [])
        if (s.path && s.signedUrl) doUrls.set(s.path, s.signedUrl);
    } catch (e) {
      console.error("signing receipt DO urls failed (non-fatal):", e);
    }
  }

  const userNames = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await sb
      .from("app_users")
      .select("id, name")
      .in("id", userIds);
    for (const u of users ?? [])
      userNames.set(u.id as string, u.name as string);
  }

  return c.json({
    receipts: rows.map((r) => {
      const lines = (Array.isArray(r.lines) ? r.lines : []) as WarehouseReceiptLine[];
      return {
        ...r,
        warehouse_name: warehouseNames.get(r.warehouse_id as string) ?? null,
        supplier_name: supplierByPo.get(r.po_id as string) ?? null,
        submitted_by_name: r.submitted_by
          ? (userNames.get(r.submitted_by as string) ?? null)
          : null,
        reviewed_by_name: r.reviewed_by
          ? (userNames.get(r.reviewed_by as string) ?? null)
          : null,
        posted_by_name: r.posted_by
          ? (userNames.get(r.posted_by as string) ?? null)
          : null,
        do_file_url: r.do_file_path
          ? (doUrls.get(r.do_file_path as string) ?? null)
          : null,
        // Composed by the shared module so the ops queue and the warehouse's
        // own list describe one receipt with one sentence.
        summary: warehouseReceiptSummary(lines),
        // Said out loud BEFORE the button is pressed: a check-in with an issue
        // files cases against a supplier.
        opens_claims: warehouseReceiptOpensClaims(lines),
      };
    }),
    counts: { waiting: waiting ?? 0 },
  });
});

/**
 * POST /:id/check-in — the stored count becomes stock.
 *
 * One RPC call, and deliberately no body: everything this books was decided by
 * the person who counted the pallet. An ops-side edit field here would be the
 * "zero ops typing" promise quietly withdrawn — a count ops disagrees with goes
 * BACK, with a reason, to the only people who can look at the goods again.
 */
warehouseReceiptsRouter.post("/:id/check-in", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, receivingMutationVersionInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("post_receiving_session", {
    p_receipt_id: c.req.param("id"),
    p_expected_version: parsed.data.expectedVersion,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const posted = (data ?? {}) as Record<string, unknown>;
  const poId = String(posted.po_id ?? posted.source_id ?? "");
  if (poId) {
    try {
      await autoReserveReceivedToSourceOrder(sb, poId);
    } catch (continuationError) {
      await sb.rpc("record_receiving_continuation_failure", {
        p_receipt_id: c.req.param("id"),
        p_code: "reservation_continuation_failed",
        p_message: continuationError instanceof Error
          ? continuationError.message
          : "Reservation continuation failed",
      });
    }
  }
  return c.json(posted);
});

/** POST /:id/send-back — return it to be recounted. The reason is required in
 *  three places (zod, the RPC, a CHECK): a rejection nobody can act on just
 *  moves the pallet's problem to a queue where nobody is looking. */
warehouseReceiptsRouter.post("/:id/send-back", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, warehouseReceiptReturnInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("return_receiving_session", {
    p_receipt_id: c.req.param("id"),
    p_expected_version: parsed.data.expectedVersion,
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? {});
});

export default warehouseReceiptsRouter;
