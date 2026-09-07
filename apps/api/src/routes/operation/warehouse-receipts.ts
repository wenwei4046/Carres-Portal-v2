import { Hono } from "hono";
import { z } from "zod";
import {
  arrivalReceivingInput,
  buildGrnRegisterView,
  goodsCategoryWordOf,
  poSupplierDeliveryDateOf,
  receiptCategoryWords,
  receivingAmendInput,
  receivingDisplayNo,
  receivingVoidInput,
  warehouseReceiptOpensClaims,
  warehouseReceiptSummary,
  warehouseReceiptReturnInput,
  type GrnRegisterFactRow,
  type PoDatePromise,
  type WarehouseReceiptLine,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { isMissingRelationError } from "../../lib/optional-relation";
import { skuCategories } from "../../lib/sku-categories";
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

// Source receipts remain a Receiving operation, under the same GRN Duty gate.
warehouseReceiptsRouter.post(
  "/arrival/:sourceId",
  requireOperation,
  async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("sourceId"));
    if (!id.success) return c.json({ message: "Invalid source" }, 422);
    const p = await parseJsonBody(c, arrivalReceivingInput);
    if (!p.ok) return c.json(p.body, p.status);
    const r = await userClient(c.env, c.var.auth.jwt).rpc(
      "receiving_arrival_post",
      { p_source_id: id.data, p_input: p.data },
    );
    if (r.error) {
      const m = mapPgError(r.error);
      return c.json(m.body, m.status);
    }
    return c.json(r.data, 201);
  },
);

warehouseReceiptsRouter.post(
  "/arrival-receipts/:id/void",
  requireOperation,
  async (c) => {
    const id = z.string().uuid().safeParse(c.req.param("id"));
    if (!id.success) return c.json({ message: "Invalid Receiving" }, 422);
    const p = await parseJsonBody(
      c,
      z.object({ reason: z.string().trim().min(1).max(2000) }).strict(),
    );
    if (!p.ok) return c.json(p.body, p.status);
    const r = await userClient(c.env, c.var.auth.jwt).rpc(
      "receiving_arrival_void",
      { p_receipt_id: id.data, p_reason: p.data.reason },
    );
    if (r.error) {
      const m = mapPgError(r.error);
      return c.json(m.body, m.status);
    }
    return c.json(r.data);
  },
);

const DEFAULT_LIMIT = 200;
/** The Register may ask for more (`?limit=`) — it virtualises its rows, so a
 *  large GRN history stays scrollable without a second fetch. Hard-capped. */
const MAX_LIMIT = 1000;
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
/** Chunked `.in(…)` read — bounded URLs, no PostgREST response ceiling. */
async function readByIds<T>(
  ids: readonly string[],
  query: (batch: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await query(unique.slice(i, i + 100));
    if (error) throw error;
    out.push(...(data ?? []));
  }
  return out;
}

/** The full record select — one string, so the paged mode and the legacy
 *  list cannot quietly read two different rows. */
const RECEIPT_FIELDS =
  "po_id, warehouse_id, do_number, do_file_path, note, lines, status, submitted_from, goods_received_at, submitted_by, submitted_at, posted_by, posted_at, reviewed_by, reviewed_at, return_reason, grn_no, actual_site_id, arrival_evidence, extra_lines, posted_duty_holder, posted_duty_cover, posted_authority, void_at, void_by, void_reason";
const RECEIPT_SELECT = `id, arrival_source_id, ${RECEIPT_FIELDS}`;
/** `arrival_source_id` lands with the arrival-source tables, still an
 *  unnumbered draft (docs/stock/MASTER.md §13.9). Until they exist every
 *  receipt is PO-backed — which is what production holds — so the register
 *  reads the same rows without that one column instead of refusing to open. */
const RECEIPT_SELECT_WITHOUT_ARRIVAL = `id, ${RECEIPT_FIELDS}`;

/** Run a receipts read with the full select; retry once without the optional
 *  column when the deployed schema does not carry it. Any other error is the
 *  caller's to handle unchanged. */
async function readReceipts<T>(run: (select: string) => Promise<T>): Promise<T> {
  try {
    return await run(RECEIPT_SELECT);
  } catch (error) {
    if (!isMissingRelationError(error)) throw error;
    return run(RECEIPT_SELECT_WITHOUT_ARRIVAL);
  }
}

const GRN_PAGE_DEFAULT = 50;
const GRN_PAGE_MAX = 200;
/** The scan's own page size — a Worker-side read, never sent to the browser. */
const GRN_SCAN_PAGE = 1000;

warehouseReceiptsRouter.get("/", requireOperation, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  /* ── `?scope=grn` — THE PAGED GRN REGISTER (owner correction 2026-09-06:
     server-side pagination; `Showing 1–50 of 10,000` and every rail count
     speak for the WHOLE filtered result set, never a loaded sample). The
     Worker scans light rows, resolves the shared facts (category ladder,
     the governed `Supplier Delivery Date`), asks the ONE pure arithmetic
     (`buildGrnRegisterView`) for facets and the slice, then reads the full
     record for just that page. Everything else keeps the legacy shape. ── */
  if (c.req.query("scope") === "grn") {
    const limit = Math.min(
      Math.max(1, Math.floor(Number(c.req.query("limit")) || GRN_PAGE_DEFAULT)),
      GRN_PAGE_MAX,
    );
    const offset = Math.max(0, Math.floor(Number(c.req.query("offset")) || 0));
    const sel = {
      category: c.req.query("category") ?? null,
      supplier: c.req.query("supplier") ?? null,
      site: c.req.query("site") ?? null,
      expected: c.req.query("expected") ?? null,
      q: c.req.query("q") ?? null,
    };

    // The scan: every GRN record (the Register boundary — `posted`/`voided`
    // only), light columns, in the register's own order (the BUSINESS date,
    // submitted stamp breaking ties).
    type ScanRow = {
      id: string;
      po_id: string;
      warehouse_id: string | null;
      actual_site_id: string | null;
      goods_received_at: string | null;
      submitted_at: string | null;
      grn_no: string | null;
      do_number: string | null;
      lines: WarehouseReceiptLine[] | null;
    };
    const scan: ScanRow[] = [];
    for (let from = 0; ; from += GRN_SCAN_PAGE) {
      const { data, error } = await sb
        .from("warehouse_receipts")
        .select(
          "id, po_id, warehouse_id, actual_site_id, goods_received_at, submitted_at, grn_no, do_number, lines",
        )
        .in("status", ["posted", "voided"])
        .order("goods_received_at", { ascending: false })
        .order("submitted_at", { ascending: false })
        .range(from, from + GRN_SCAN_PAGE - 1);
      if (error) {
        const m = mapPgError(error);
        return c.json(m.body, m.status);
      }
      scan.push(...((data ?? []) as ScanRow[]));
      if ((data ?? []).length < GRN_SCAN_PAGE) break;
    }

    const scanPoIds = [...new Set(scan.map((r) => r.po_id).filter(Boolean))];
    const scanWhIds = [
      ...new Set(
        scan
          .flatMap((r) => [r.warehouse_id, r.actual_site_id])
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    ];

    let poRows: Array<Record<string, unknown>> = [];
    let promiseRows: Array<Record<string, unknown>> = [];
    let whRows: Array<{ id: string; name: string }> = [];
    try {
      [poRows, promiseRows, whRows] = await Promise.all([
        readByIds<Record<string, unknown>>(scanPoIds, (ids) =>
          sb
            .from("purchase_orders")
            .select("id, version, supplier_id, suppliers(name)")
            .in("id", ids),
        ),
        // Only the fields the ONE reply arithmetic reads
        // (`poSupplierDeliveryDateOf` — an evidenced answer about the exact
        // PO version). Receiving re-derives nothing.
        readByIds<Record<string, unknown>>(scanPoIds, (ids) =>
          sb
            .from("po_supplier_promises")
            .select(
              "po_id, kind, answer, about_date, new_date, po_version, channel, recipient, evidence, reported_by, reported_at, recorded_by, recorded_at",
            )
            .in("po_id", ids)
            .order("recorded_at", { ascending: false }),
        ),
        readByIds<{ id: string; name: string }>(scanWhIds, (ids) =>
          sb.from("warehouses").select("id, name").in("id", ids),
        ),
      ]);
    } catch (error) {
      const m = mapPgError(error as never);
      return c.json(m.body, m.status);
    }

    const supplierByPo = new Map<string, string | null>();
    const versionByPo = new Map<string, number>();
    for (const p of poRows) {
      const sup = p.suppliers as { name?: string } | null;
      supplierByPo.set(p.id as string, sup?.name ?? null);
      versionByPo.set(p.id as string, (p.version as number | null) ?? 1);
    }
    const promisesByPo = new Map<string, PoDatePromise[]>();
    for (const row of promiseRows) {
      const pid = row.po_id as string;
      const hist = promisesByPo.get(pid) ?? [];
      hist.push(row as unknown as PoDatePromise);
      promisesByPo.set(pid, hist);
    }
    const supplierDateByPo = new Map<string, string | null>();
    for (const pid of scanPoIds) {
      supplierDateByPo.set(
        pid,
        poSupplierDeliveryDateOf(promisesByPo.get(pid), versionByPo.get(pid) ?? 1),
      );
    }
    const whNames = new Map(whRows.map((w) => [w.id, w.name]));

    const scanCatalog = await skuCategories(
      sb,
      scan.flatMap((r) => (r.lines ?? []).map((l) => l.sku)),
    );

    const factRows: GrnRegisterFactRow[] = scan.map((r) => {
      const supplierName = supplierByPo.get(r.po_id) ?? null;
      return {
        id: r.id,
        categories: receiptCategoryWords(r.lines, scanCatalog),
        supplierName,
        siteName:
          (r.actual_site_id ? whNames.get(r.actual_site_id) : null) ??
          (r.warehouse_id ? whNames.get(r.warehouse_id) : null) ??
          null,
        supplierDeliveryDateIso: supplierDateByPo.get(r.po_id) ?? null,
        // The Search box's own promise: GRN, PO, supplier or DO number.
        searchText: [
          receivingDisplayNo({
            id: r.id,
            grn_no: r.grn_no,
            goods_received_at: r.goods_received_at ?? undefined,
            submitted_at: r.submitted_at ?? undefined,
          }),
          r.po_id,
          r.do_number ?? "",
          supplierName ?? "",
        ].join(" "),
      };
    });

    const view = buildGrnRegisterView(factRows, sel, offset, limit);

    // The page itself — full records for exactly these ids, in the scan's
    // order (a `.in(…)` read has no order of its own).
    let pageRows: ReceiptRow[] = [];
    try {
      pageRows = await readReceipts((select) =>
        readByIds<ReceiptRow>(view.pageIds, (ids) =>
          sb.from("warehouse_receipts").select(select).in("id", ids) as unknown as
            PromiseLike<{ data: ReceiptRow[] | null; error: unknown }>,
        ),
      );
    } catch (error) {
      const m = mapPgError(error as never);
      return c.json(m.body, m.status);
    }
    const byId = new Map(pageRows.map((r) => [r.id as string, r]));
    const ordered = view.pageIds
      .map((id) => byId.get(id))
      .filter((r): r is ReceiptRow => r != null);

    const pageUserIds = [
      ...new Set(
        ordered
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
    const userNames = new Map<string, string>();
    if (pageUserIds.length > 0) {
      const { data: users } = await sb
        .from("app_users")
        .select("id, name")
        .in("id", pageUserIds);
      for (const u of users ?? [])
        userNames.set(u.id as string, u.name as string);
    }

    // The Product cell speaks the GRN PAPER's word — `product_skus.variant`,
    // else the SKU — resolved for the page only.
    const pageSkus = [
      ...new Set(
        ordered.flatMap((r) =>
          ((Array.isArray(r.lines) ? r.lines : []) as WarehouseReceiptLine[]).map(
            (l) => l.sku,
          ),
        ),
      ),
    ];
    const productWordBySku = new Map<string, string>();
    if (pageSkus.length > 0) {
      const { data: skuRows } = await sb
        .from("product_skus")
        .select("sku, variant")
        .in("sku", pageSkus);
      for (const s of (skuRows ?? []) as Array<{ sku: string; variant: string | null }>)
        if (s.variant) productWordBySku.set(s.sku, s.variant);
    }

    // Signed DOs — page rows only, best-effort exactly as the legacy list.
    const doPaths = ordered
      .map((r) => r.do_file_path as string | null)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    const doUrls = new Map<string, string>();
    if (doPaths.length > 0) {
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

    const { count: waiting } = await sb
      .from("warehouse_receipts")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted");

    return c.json({
      receipts: ordered.map((r) => {
        const lines = (Array.isArray(r.lines) ? r.lines : []) as WarehouseReceiptLine[];
        return {
          ...r,
          categories: receiptCategoryWords(lines, scanCatalog),
          warehouse_name: whNames.get(r.warehouse_id as string) ?? null,
          supplier_name: supplierByPo.get(r.po_id as string) ?? null,
          supplier_delivery_date: supplierDateByPo.get(r.po_id as string) ?? null,
          product_labels: [
            ...new Set(lines.map((l) => productWordBySku.get(l.sku) ?? l.sku)),
          ],
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
            ? (whNames.get(r.actual_site_id as string) ?? null)
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
          summary: warehouseReceiptSummary(lines),
          opens_claims: warehouseReceiptOpensClaims(lines),
        };
      }),
      page: { offset, limit, total: view.total },
      facets: view.facets,
      counts: { waiting: waiting ?? 0 },
    });
  }

  const raw = (c.req.query("status") ?? "submitted").toLowerCase();
  const status = (
    ["submitted", "returned", "posted", "voided", "all"] as const
  ).includes(raw as never)
    ? raw
    : "submitted";

  // C2 widened this select: `submitted_from` · `goods_received_at` ·
  // `posted_*` are what the Goods Received register reads, and they are
  // 0314/0315 columns it predates. `reviewed_*` stays until the reader-rename
  // slice drops it (0314's own discipline). 0426 widened it again: grn_no ·
  // actual_site_id · arrival_evidence · extra_lines · the posted
  // duty-evidence trio · void_* are what the Register and the GRN record read.
  const listRead = async (select: string) => {
    let q = sb
      .from("warehouse_receipts")
      .select(select)
      // The register is a HISTORY, so it sorts by the BUSINESS date — when
      // the goods physically arrived — not by when somebody keyed them in.
      // The submitted stamp only breaks ties.
      .order("goods_received_at", { ascending: false })
      .order("submitted_at", { ascending: false })
      .limit(
        Math.min(
          Math.max(1, Math.floor(Number(c.req.query("limit")) || DEFAULT_LIMIT)),
          MAX_LIMIT,
        ),
      );
    if (status !== "all") q = q.eq("status", status);
    const res = (await q) as unknown as {
      data: unknown[] | null;
      error: unknown;
    };
    if (res.error) throw res.error;
    return res.data;
  };

  let data: unknown[] | null = null;
  try {
    data = await readReceipts(listRead);
  } catch (err) {
    const m = mapPgError(err as never);
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
  const poIds = [
    ...new Set(rows.map((r) => r.po_id as string).filter(Boolean)),
  ];
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

  const arrivalIds = [
    ...new Set(
      rows
        .map((r) => r.arrival_source_id)
        .filter((v): v is string => typeof v === "string"),
    ),
  ];
  const arrivalNames = new Map<
    string,
    { source_no: string; party_name: string | null }
  >();
  if (arrivalIds.length) {
    const { data: sources, error: sourceError } = await sb
      .from("arrival_sources")
      .select("id,source_no,stock_operating_parties(name)")
      .in("id", arrivalIds);
    if (sourceError) {
      const m = mapPgError(sourceError);
      return c.json(m.body, m.status);
    }
    for (const source of sources ?? [])
      arrivalNames.set(source.id, {
        source_no: source.source_no,
        party_name:
          (source.stock_operating_parties as unknown as { name: string } | null)
            ?.name ?? null,
      });
  }

  /**
   * The signed DO — a short-lived URL per row, batch-signed exactly the way
   * `supplier-claims` signs its claim photos. The signed DO IS the record's
   * evidence, so a register that cannot open it is a filing cabinet with the
   * paper removed. Signed only for the rows this page returns.
   */

  const doUrls = new Map<string, string>();
  for (const bucket of ["delivery-orders", "arrival-proofs"]) {
    const doPaths = rows
      .filter(
        (r) =>
          (r.arrival_source_id ? "arrival-proofs" : "delivery-orders") ===
          bucket,
      )
      .map((r) => r.do_file_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    if (!doPaths.length) continue;
    // Best-effort, and deliberately so: the register's job is to LIST the
    // records. If storage refuses to sign, the row still appears and its
    // record reads `Not on file` — a queue that 500s because one attachment
    // could not be signed would hide every delivery we ever took.
    try {
      const admin = adminClient(c.env);
      const { data: signed } = await admin.storage
        .from(bucket)
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

  // The rail's CATEGORY facet (owner correction 2026-09-06): the catalog's
  // answer through the ONE shared reader, folded by the ONE shared ladder —
  // Receiving never derives its own category from SKU text.
  const allSkus = rows.flatMap((r) =>
    ((Array.isArray(r.lines) ? r.lines : []) as WarehouseReceiptLine[]).map(
      (l) => l.sku,
    ),
  );
  const catalogCategories = await skuCategories(sb, allSkus);

  return c.json({
    receipts: rows.map((r) => {
      const lines = (
        Array.isArray(r.lines) ? r.lines : []
      ) as WarehouseReceiptLine[];
      return {
        ...r,
        source_no:
          arrivalNames.get(r.arrival_source_id as string)?.source_no ??
          r.po_id ??
          null,
        source_party_name:
          arrivalNames.get(r.arrival_source_id as string)?.party_name ??
          supplierByPo.get(r.po_id as string) ??
          null,
        categories: receiptCategoryWords(lines, catalogCategories),
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
  // Validated as a UUID here, so a malformed value is the caller's 422 and
  // never Postgres's 22P02 dressed as a 500.
  let actualSiteId: string | null = null;
  try {
    const body = (await c.req.json()) as { actualSiteId?: unknown };
    if (typeof body?.actualSiteId === "string") {
      const parsed = z.string().uuid().safeParse(body.actualSiteId);
      if (!parsed.success) {
        return c.json(
          {
            error: "invalid_input",
            code: "invalid_param",
            message: "actualSiteId must be a warehouse id",
            field: "actualSiteId",
          },
          422,
        );
      }
      actualSiteId = parsed.data;
    }
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
  let row: Record<string, unknown> | null = null;
  let error: unknown = null;
  try {
    row = await readReceipts(async (select) => {
      const res = (await sb
        .from("warehouse_receipts")
        .select(select)
        .eq("id", id)
        .maybeSingle()) as unknown as {
        data: Record<string, unknown> | null;
        error: unknown;
      };
      if (res.error) throw res.error;
      return res.data;
    });
  } catch (e) {
    error = e;
  }
  if (error) {
    const m = mapPgError(error as never);
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
      .select(
        "id, supplier_id, warehouse_id, destination_id, is_consignment, suppliers(name), purchase_order_lines(id, sku, qty, received_qty, damaged_qty, wrong_item_qty)",
      )
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
        ...((evs ?? []) as Array<Record<string, unknown>>).map(
          (e) => e.actor_id,
        ),
      ].filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  ];
  const userNames = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await sb
      .from("app_users")
      .select("id, name")
      .in("id", userIds);
    for (const u of users ?? [])
      userNames.set(u.id as string, u.name as string);
  }
  const whIds = [r.warehouse_id, r.actual_site_id].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  const whNames = new Map<string, string>();
  if (whIds.length > 0) {
    const { data: whs } = await sb
      .from("warehouses")
      .select("id, name")
      .in("id", whIds);
    for (const w of whs ?? []) whNames.set(w.id as string, w.name as string);
  }
  // The formal GRN document's product facts: the human description (the same
  // `product_skus.variant` lookup the DO print path uses) and the governed
  // category word through the ONE shared ladder — never a SKU-text rule of
  // Receiving's own.
  const receiptLines = (
    Array.isArray(r.lines) ? r.lines : []
  ) as WarehouseReceiptLine[];
  const extraLines = (
    Array.isArray(r.extra_lines) ? r.extra_lines : []
  ) as Array<{
    sku: string;
  }>;
  const docSkus = [
    ...new Set([
      ...receiptLines.map((l) => l.sku),
      ...extraLines.map((x) => x.sku),
    ]),
  ];
  const lineInfo: Record<
    string,
    { description: string | null; category: string }
  > = {};
  if (docSkus.length > 0) {
    const catalog = await skuCategories(sb, docSkus);
    const descriptions = new Map<string, string>();
    const { data: skuRows } = await sb
      .from("product_skus")
      .select("sku, variant")
      .in("sku", docSkus);
    for (const row2 of (skuRows ?? []) as Array<{
      sku: string;
      variant: string | null;
    }>) {
      if (row2.variant) descriptions.set(row2.sku, row2.variant);
    }
    for (const sku of docSkus) {
      lineInfo[sku] = {
        description: descriptions.get(sku) ?? null,
        category: goodsCategoryWordOf({
          sku,
          category: catalog.get(sku) ?? null,
        }),
      };
    }
  }

  let doUrl: string | null = null;
  if (typeof r.do_file_path === "string" && r.do_file_path.length > 0) {
    try {
      const admin = adminClient(c.env);
      const { data: signed } = await admin.storage
        .from(r.arrival_source_id ? "arrival-proofs" : "delivery-orders")
        .createSignedUrl(r.do_file_path, SIGNED_URL_TTL_SECONDS);
      doUrl = signed?.signedUrl ?? null;
    } catch (e) {
      console.error("signing receipt DO url failed (non-fatal):", e);
    }
  }
  /* Arrival evidence was stored (0426) but never viewable — sign every file
     so the record can be RE-SEEN, not only counted (unified card §9). */
  let arrivalEvidence: Array<{ path: string; kind: string; url: string | null }> =
    [];
  if (Array.isArray(r.arrival_evidence) && r.arrival_evidence.length > 0) {
    const files = (r.arrival_evidence as Array<{ path?: string; kind?: string }>)
      .filter((f) => typeof f?.path === "string" && f.path.length > 0)
      .map((f) => ({ path: f.path as string, kind: f.kind === "video" ? "video" : "photo" }));
    try {
      const admin = adminClient(c.env);
      const { data: signedFiles } = await admin.storage
        .from(r.arrival_source_id ? "arrival-proofs" : "delivery-orders")
        .createSignedUrls(files.map((f) => f.path), SIGNED_URL_TTL_SECONDS);
      arrivalEvidence = files.map((f, i) => ({
        ...f,
        url: signedFiles?.[i]?.signedUrl ?? null,
      }));
    } catch (e) {
      console.error("signing arrival evidence failed (non-fatal):", e);
      arrivalEvidence = files.map((f) => ({ ...f, url: null }));
    }
  }
  const name = (v: unknown) =>
    typeof v === "string" && v.length > 0 ? (userNames.get(v) ?? null) : null;
  const sup = (po as Record<string, unknown> | null)?.suppliers as {
    name?: string;
  } | null;
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
      arrival_evidence_files: arrivalEvidence,
      unit_results: units ?? [],
    },
    line_info: lineInfo,
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
  if (d.goodsReceivedAt !== undefined)
    changes.goods_received_at = d.goodsReceivedAt;
  if (d.doNumber !== undefined) changes.do_number = d.doNumber;
  if (d.actualSiteId !== undefined) changes.actual_site_id = d.actualSiteId;
  if (d.doFilePath !== undefined) changes.do_file_path = d.doFilePath;
  if (d.arrivalEvidenceAdd !== undefined)
    changes.arrival_evidence_add = d.arrivalEvidenceAdd;
  if (d.lines !== undefined)
    changes.lines = d.lines.map((l) => ({
      id: l.id,
      received_now: l.receivedNow,
    }));
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
