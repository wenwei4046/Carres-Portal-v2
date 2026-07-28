import { Hono } from "hono";
import {
  warehouseReceiptOpensClaims,
  warehouseReceiptSummary,
  warehouseReceiptReturnInput,
  type WarehouseReceiptLine,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
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

type ReceiptRow = Record<string, unknown>;

/**
 * GET / — `?status=submitted|checked_in|returned|all` (default `submitted`).
 *
 * Defaults to the OPEN queue for the same reason R3's claim list defaults to
 * open: this is a worklist, and a worklist that opens on settled rows is a
 * filing cabinet.
 *
 * Names are resolved here rather than embedded in the row: a receipt snapshots
 * its warehouse id so the record of who counted survives a PO being relocated,
 * but a human reading the queue needs the name as it stands today.
 */
warehouseReceiptsRouter.get("/", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const raw = (c.req.query("status") ?? "submitted").toLowerCase();
  const status =
    raw === "checked_in" || raw === "returned" || raw === "all"
      ? raw
      : "submitted";

  let q = sb
    .from("warehouse_receipts")
    .select(
      "id, po_id, warehouse_id, do_number, do_file_path, note, lines, status, submitted_by, submitted_at, reviewed_by, reviewed_at, return_reason",
    )
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
        .flatMap((r) => [r.submitted_by, r.reviewed_by])
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
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("warehouse_receipt_check_in", {
    p_receipt_id: c.req.param("id"),
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
