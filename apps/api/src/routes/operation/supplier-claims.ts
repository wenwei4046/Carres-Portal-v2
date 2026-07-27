import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapPgError } from "../../lib/route-helpers";
import { adminClient, userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/supplier-claims — R2 of the receiving & claim queue
 * (docs/receiving-claim-execution-queue.md, Jess 2026-07-27).
 *
 * The read side of the claim. Nothing here WRITES a claim: claims are minted
 * inside `operation_receive_po_with_do` (a damaged / wrong-item report) and
 * `supplier_claim_sweep_overdue` (a promise the supplier did not keep), both in
 * migration 0288, and a guard trigger refuses any PO-line issue that has no
 * covering claim. There is deliberately no "file a claim" endpoint — a claim
 * with no receiving behind it would be exactly the free-text hole the whole
 * queue exists to close.
 *
 *   GET  /                — the queue (status filter + supplier/PO names)
 *   GET  /:id/photos      — signed URLs for that claim's evidence
 *
 * Role: operation + principal. `supplier_claims` RLS admits every internal role
 * (principal/operation/finance/bd) for SELECT; this endpoint is narrower on
 * purpose — the claim desk is an operations surface, and finance has no move to
 * make on a claim (a claim NEVER produces a credit note; resolutions are goods
 * actions). Widen it when a card asks for it, not before.
 */
const supplierClaimsRouter = new Hono<AppEnv>();

const DEFAULT_LIMIT = 200;
const SIGNED_URL_TTL_SECONDS = 3600;

type ClaimPhoto = { path: string; at?: string; by?: string | null };

function gate(c: { var: { auth: { role: string } } }) {
  const role = c.var.auth.role;
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "operation or principal only" });
  }
}

// ----- GET / -----
//
// `?status=open|closed|all` (default `open` — the queue is a worklist, and a
// worklist that opens on closed rows is a filing cabinet). Supplier and
// reporter NAMES are resolved here rather than embedded in the claim row: the
// claim snapshots the supplier ID because the chase must survive a rename, but
// a human reading the queue needs the name as it stands today.
supplierClaimsRouter.get("/", async (c) => {
  gate(c);
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);

  const statusParam = (c.req.query("status") ?? "open").toLowerCase();
  const status =
    statusParam === "closed" || statusParam === "all" ? statusParam : "open";

  let q = sb
    .from("supplier_claims")
    .select(
      "id, claim_no, po_id, po_line_id, supplier_id, sku, product_category, claim_type, qty, status, do_number, photos, note, reported_by, reported_at",
    )
    .order("reported_at", { ascending: false })
    .limit(DEFAULT_LIMIT);
  if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const claims = (data ?? []) as Array<Record<string, unknown>>;

  // Counts for the tab chips come from a separate, unfiltered head-count so the
  // numbers stay right even when the visible page is capped at DEFAULT_LIMIT.
  const [{ count: openCount }, { count: closedCount }] = await Promise.all([
    sb
      .from("supplier_claims")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    sb
      .from("supplier_claims")
      .select("id", { count: "exact", head: true })
      .eq("status", "closed"),
  ]);

  const supplierIds = [
    ...new Set(claims.map((r) => r.supplier_id as string).filter(Boolean)),
  ];
  const reporterIds = [
    ...new Set(claims.map((r) => r.reported_by as string).filter(Boolean)),
  ];

  const supplierNames = new Map<string, string>();
  if (supplierIds.length > 0) {
    const { data: sup } = await sb
      .from("suppliers")
      .select("id, name")
      .in("id", supplierIds);
    for (const s of sup ?? [])
      supplierNames.set(s.id as string, s.name as string);
  }
  const reporterNames = new Map<string, string>();
  if (reporterIds.length > 0) {
    const { data: users } = await sb
      .from("app_users")
      .select("id, name")
      .in("id", reporterIds);
    for (const u of users ?? [])
      reporterNames.set(u.id as string, u.name as string);
  }

  return c.json({
    claims: claims.map((r) => ({
      ...r,
      supplier_name: supplierNames.get(r.supplier_id as string) ?? null,
      reported_by_name: r.reported_by
        ? (reporterNames.get(r.reported_by as string) ?? null)
        : null,
      photo_count: Array.isArray(r.photos) ? r.photos.length : 0,
    })),
    counts: {
      open: openCount ?? 0,
      closed: closedCount ?? 0,
      all: (openCount ?? 0) + (closedCount ?? 0),
    },
  });
});

// ----- GET /:id/photos -----
//
// The evidence, viewable. Same shape and same reasoning as the delivery-photo
// route (0280): the row is read with the caller's JWT so RLS is the security
// boundary, and only THEN are URLs signed with the service client — the
// `delivery-orders` bucket is private and its read policy still names the
// pre-0121 'logistics' role, so a user-JWT signed URL was never a working path
// here.
supplierClaimsRouter.get("/:id/photos", async (c) => {
  gate(c);
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);

  const { data, error } = await sb
    .from("supplier_claims")
    .select("photos")
    .eq("id", c.req.param("id"))
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) throw new HTTPException(404, { message: "claim not found" });

  const entries: ClaimPhoto[] = Array.isArray(data.photos)
    ? (data.photos as ClaimPhoto[])
    : [];
  if (entries.length === 0) return c.json({ photos: [] });

  const admin = adminClient(c.env);
  const photos = await Promise.all(
    entries.map(async (e) => {
      const { data: signed } = await admin.storage
        .from("delivery-orders")
        .createSignedUrl(e.path, SIGNED_URL_TTL_SECONDS);
      return { ...e, url: signed?.signedUrl ?? null };
    }),
  );
  return c.json({ photos });
});

export default supplierClaimsRouter;
