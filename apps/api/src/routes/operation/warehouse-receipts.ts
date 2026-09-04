import { Hono } from "hono";
import {
  receivingAmendInput,
  receivingVoidInput,
  warehouseReceiptOpensClaims,
  warehouseReceiptSummary,
  warehouseReceiptReturnInput,
  type WarehouseReceiptLine,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { adminClient, userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/warehouse-receipts — the ops half of R6.
 *
 * The card's done-when is "a Klang receiving lands in the system with zero ops
 * typing — ops only reviews", so this router has exactly two moves and neither
 * of them re-enters a number:
 *
 *   GET  /              what the warehouse filed and is waiting on
 *   POST /:id/check-in  replay it through the receive engine
 *   POST /:id/send-back return it with a reason to recount
 *
 * Check-in does NOT receive the PO here. `warehouse_receipt_check_in` (0302)
 * rebuilds the payload and calls `operation_receive_po_with_do` — the one
 * receive implementation in the database — so R1's counters, R2's claim
 * minting and its guard trigger, R4's quarantine and the thread/stock cascade
 * all happen exactly as they do when ops receives a PO by hand. A second
 * receive path here is the thing this card must not create.
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
      // 0426 widened this: grn_no · actual_site_id · arrival_evidence ·
      // extra_lines · the posted duty-evidence trio · void_* are what the
      // Receiving Register and the GRN record read.
      "id, po_id, warehouse_id, do_number, do_file_path, note, lines, status, submitted_from, goods_received_at, submitted_by, submitted_at, posted_by, posted_at, reviewed_by, reviewed_at, return_reason, grn_no, actual_site_id, arrival_evidence, extra_lines, posted_duty_holder, posted_duty_cover, posted_authority, void_at, void_by, void_reason",
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
    ...new Set(
      rows
        .flatMap((r) => [r.warehouse_id, r.actual_site_id])
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  ];
  const poIds = [...new Set(rows.map((r) => r.po_id as string).filter(Boolean))];
  const userIds = [
    ...new Set(
      rows
        .flatMap((r) => [
          r.submitted_by,
          r.reviewed_by,
          r.posted_by,
          r.posted_duty_holder,
          r.posted_duty_cover,
          r.void_by,
        ])
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
        actual_site_name: r.actual_site_id
          ? (warehouseNames.get(r.actual_site_id as string) ?? null)
          : null,
        posted_duty_holder_name: r.posted_duty_holder
          ? (userNames.get(r.posted_duty_holder as string) ?? null)
          : null,
        posted_duty_cover_name: r.posted_duty_cover
          ? (userNames.get(r.posted_duty_cover as string) ?? null)
          : null,
        void_by_name: r.void_by
          ? (userNames.get(r.void_by as string) ?? null)
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
  // The optional body carries only the Actual Site — everything counted was
  // decided by the person who held the pallet. Absent body = original flow.
  let actualSiteId: string | null = null;
  try {
    const body = (await c.req.json()) as { actualSiteId?: unknown };
    if (typeof body?.actualSiteId === "string") actualSiteId = body.actualSiteId;
  } catch {
    /* no body — fine */
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("warehouse_receipt_check_in", {
    p_receipt_id: c.req.param("id"),
    p_actual_site_id: actualSiteId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? {});
});

/**
 * GET /duty — who may save a Receiving today (0425 `receiving_actor_context`).
 *
 * The page consumes the RESOLVED owner; it never reads a rota or computes an
 * offset (ERP-ARCHITECTURE Law F.1). Names ride along so the chip can speak.
 */
warehouseReceiptsRouter.get("/duty", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("receiving_actor_context");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const ctx = (data ?? {}) as Record<string, unknown>;
  const ids = [ctx.normal_user_id, ctx.acting_user_id].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: users } = await sb
      .from("app_users")
      .select("id, name")
      .in("id", ids);
    for (const u of users ?? []) names.set(u.id as string, u.name as string);
  }
  return c.json({
    ...ctx,
    normal_user_name: ctx.normal_user_id
      ? (names.get(ctx.normal_user_id as string) ?? null)
      : null,
    acting_user_name: ctx.acting_user_id
      ? (names.get(ctx.acting_user_id as string) ?? null)
      : null,
  });
});

/**
 * GET /:id — one Receiving Session / GRN record: the row, its per-Unit
 * results and its append-only events, names resolved.
 */
warehouseReceiptsRouter.get("/:id", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const id = c.req.param("id");
  const { data: row, error } = await sb
    .from("warehouse_receipts")
    .select(
      "id, po_id, warehouse_id, do_number, do_file_path, note, lines, status, submitted_from, goods_received_at, submitted_by, submitted_at, posted_by, posted_at, reviewed_by, reviewed_at, return_reason, grn_no, actual_site_id, arrival_evidence, extra_lines, posted_duty_holder, posted_duty_cover, posted_authority, void_at, void_by, void_reason",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!row) return c.json({ error: "receipt not found" }, 404);
  const r = row as ReceiptRow;

  const [{ data: units }, { data: evs }, { data: po }] = await Promise.all([
    sb
      .from("receiving_unit_results")
      .select("stock_item_id, unit_code, outcome, issue_kind, note")
      .eq("receipt_id", id)
      .order("unit_code"),
    sb
      .from("receiving_events")
      .select("id, receipt_id, event, actor_id, event_at, payload")
      .eq("receipt_id", id)
      .order("event_at", { ascending: false }),
    sb
      .from("purchase_orders")
      .select("id, supplier_id, warehouse_id, destination_id, suppliers(name), purchase_order_lines(id, sku, qty, received_qty, damaged_qty, wrong_item_qty)")
      .eq("id", r.po_id as string)
      .maybeSingle(),
  ]);

  const userIds = [
    ...new Set(
      [
        r.submitted_by,
        r.posted_by,
        r.reviewed_by,
        r.posted_duty_holder,
        r.posted_duty_cover,
        r.void_by,
        ...((evs ?? []) as Array<Record<string, unknown>>).map((e) => e.actor_id),
      ].filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  ];
  const userNames = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await sb
      .from("app_users")
      .select("id, name")
      .in("id", userIds);
    for (const u of users ?? []) userNames.set(u.id as string, u.name as string);
  }
  const whIds = [r.warehouse_id, r.actual_site_id].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  const whNames = new Map<string, string>();
  if (whIds.length > 0) {
    const { data: whs } = await sb.from("warehouses").select("id, name").in("id", whIds);
    for (const w of whs ?? []) whNames.set(w.id as string, w.name as string);
  }
  let doUrl: string | null = null;
  if (typeof r.do_file_path === "string" && r.do_file_path.length > 0) {
    try {
      const admin = adminClient(c.env);
      const { data: signed } = await admin.storage
        .from("delivery-orders")
        .createSignedUrl(r.do_file_path, SIGNED_URL_TTL_SECONDS);
      doUrl = signed?.signedUrl ?? null;
    } catch (e) {
      console.error("signing receipt DO url failed (non-fatal):", e);
    }
  }
  const name = (v: unknown) =>
    typeof v === "string" && v.length > 0 ? (userNames.get(v) ?? null) : null;
  const sup = (po as Record<string, unknown> | null)?.suppliers as
    | { name?: string }
    | null;
  return c.json({
    receipt: {
      ...r,
      supplier_name: sup?.name ?? null,
      warehouse_name:
        typeof r.warehouse_id === "string"
          ? (whNames.get(r.warehouse_id) ?? null)
          : null,
      actual_site_name:
        typeof r.actual_site_id === "string"
          ? (whNames.get(r.actual_site_id) ?? null)
          : null,
      submitted_by_name: name(r.submitted_by),
      posted_by_name: name(r.posted_by),
      posted_duty_holder_name: name(r.posted_duty_holder),
      posted_duty_cover_name: name(r.posted_duty_cover),
      void_by_name: name(r.void_by),
      do_file_url: doUrl,
      unit_results: units ?? [],
    },
    po: po ?? null,
    events: ((evs ?? []) as Array<Record<string, unknown>>).map((e) => ({
      ...e,
      actor_name: name(e.actor_id),
    })),
  });
});

/**
 * POST /:id/amend — `Amend Receiving` (0426). Reason required; before/after
 * and the safe recalculation live in the RPC; a blocked correction comes back
 * as the RPC's named refusal.
 */
warehouseReceiptsRouter.post("/:id/amend", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, receivingAmendInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const changes: Record<string, unknown> = {};
  if (d.goodsReceivedAt !== undefined) changes.goods_received_at = d.goodsReceivedAt;
  if (d.doNumber !== undefined) changes.do_number = d.doNumber;
  if (d.actualSiteId !== undefined) changes.actual_site_id = d.actualSiteId;
  if (d.lines !== undefined)
    changes.lines = d.lines.map((l) => ({ id: l.id, received_now: l.receivedNow }));
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("receiving_amend", {
    p_receipt_id: c.req.param("id"),
    p_reason: d.reason,
    p_changes: changes,
    p_save_key: d.saveKey ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? {});
});

/** POST /:id/void — `Void Receiving` (0426): only for a GRN that should never
 *  have existed. Downstream blockers refuse by name; nothing partially voids. */
warehouseReceiptsRouter.post("/:id/void", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, receivingVoidInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("receiving_void", {
    p_receipt_id: c.req.param("id"),
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? {});
});

/** POST /:id/send-back — return it to be recounted. The reason is required in
 *  three places (zod, the RPC, a CHECK): a rejection nobody can act on just
 *  moves the pallet's problem to a queue where nobody is looking. */
warehouseReceiptsRouter.post("/:id/send-back", requireOperation, async (c) => {
  const parsed = await parseJsonBody(c, warehouseReceiptReturnInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("warehouse_receipt_return", {
    p_receipt_id: c.req.param("id"),
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? {});
});

export default warehouseReceiptsRouter;
