import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  SUPPLIER_CLAIM_LATE,
  SUPPLIER_CLAIM_REQUEST_KEYS,
  SUPPLIER_CLAIM_RESPONSE_KEYS,
  claimNextMove,
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { adminClient, userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/supplier-claims — R2 + R3 of the receiving & claim queue
 * (docs/receiving-claim-execution-queue.md, Jess 2026-07-27).
 *
 * A claim is never FILED here: claims are minted inside
 * `operation_receive_po_with_do` (a damaged / wrong-item report) and
 * `supplier_claim_sweep_overdue` (a promise the supplier did not keep), both in
 * migration 0288, and a guard trigger refuses any PO-line issue that has no
 * covering claim. A hand-filed claim would be a receiving problem with no
 * receiving behind it — the exact hole the queue exists to close.
 *
 * What R3 adds is the claim's LIFE: what we asked, what they answered, and the
 * close. Each is its own RPC in 0291 — `supplier_claims` has no write policy at
 * all, so there is no PostgREST door that can edit a claim by hand.
 *
 *   GET  /                — the queue (status filter, names, who owes next)
 *   GET  /:id/photos      — signed URLs for that claim's evidence
 *   POST /:id/request     — what WE ask the supplier to do
 *   POST /:id/response    — what the SUPPLIER answered
 *   POST /:id/close       — settle it (refuses unless both sides are on file)
 *
 * Role: operation + principal, on every route. `supplier_claims` RLS admits
 * every internal role (principal/operation/finance/bd) for SELECT; this
 * endpoint is narrower on purpose — the claim desk is an operations surface,
 * and finance has no move to make on a claim (a claim NEVER produces a credit
 * note; resolutions are goods actions). Widen it when a card asks for it, not
 * before. The RPCs gate independently, so this is defence in depth rather than
 * the only lock.
 */
const supplierClaimsRouter = new Hono<AppEnv>();

const DEFAULT_LIMIT = 200;
const SIGNED_URL_TTL_SECONDS = 3600;
/** A note long enough to record a real agreement, short enough not to become a
 *  document. Prose belongs in the note, never instead of the picked answer. */
const NOTE_MAX = 500;

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
      "id, claim_no, po_id, po_line_id, supplier_id, sku, product_category, claim_type, qty, status, do_number, photos, note, reported_by, reported_at, requested_action, requested_at, supplier_response, supplier_response_note, responded_at, closed_at, close_note",
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

  // R3 — does the PO line behind a LATE claim still owe us units?
  //
  // Read for late claims only, because they are the only ones that can go
  // stale: a late claim is minted automatically every night and the sweep never
  // closes one, so a queue that never re-checks would keep saying "Ohana owes
  // the next move" long after Ohana delivered. Arrived-goods claims need no
  // such check — the goods are already in the warehouse.
  //
  // A line we cannot read (deleted line → `po_line_id` is ON DELETE SET NULL,
  // or an RLS-invisible row) stays absent from this map, and `claimNextMove`
  // treats absent as STILL PENDING. Unknown must never be reported as
  // "delivered".
  const lateLineIds = [
    ...new Set(
      claims
        .filter((r) => r.claim_type === SUPPLIER_CLAIM_LATE && r.po_line_id)
        .map((r) => r.po_line_id as string),
    ),
  ];
  const linePending = new Map<string, boolean>();
  if (lateLineIds.length > 0) {
    const { data: lines } = await sb
      .from("purchase_order_lines")
      .select("id, qty, received_qty")
      .in("id", lateLineIds);
    for (const l of lines ?? []) {
      linePending.set(
        l.id as string,
        Number(l.qty ?? 0) > Number(l.received_qty ?? 0),
      );
    }
  }

  return c.json({
    claims: claims.map((r) => {
      const supplier_name = supplierNames.get(r.supplier_id as string) ?? null;
      const line_pending = r.po_line_id
        ? (linePending.get(r.po_line_id as string) ?? null)
        : null;
      return {
        ...r,
        supplier_name,
        reported_by_name: r.reported_by
          ? (reporterNames.get(r.reported_by as string) ?? null)
          : null,
        photo_count: Array.isArray(r.photos) ? r.photos.length : 0,
        line_pending,
        // Computed here so the row, the button and any future digest all read
        // the same sentence — one rule, in the shared module.
        next_move: claimNextMove({
          claim_no: r.claim_no as string,
          status: r.status as string,
          claim_type: r.claim_type as string,
          requested_action: (r.requested_action as string | null) ?? null,
          supplier_response: (r.supplier_response as string | null) ?? null,
          supplier_name,
          line_pending,
        }),
      };
    }),
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

// ----- R3 · the three moves -------------------------------------------------
//
// Each one is a thin door onto an RPC in 0291. The rules — which ask is legal
// for which claim type, which answers need a note, that an answer cannot exist
// without a question, that a close needs both sides — all live in the database,
// because `supplier_claims` is writable from nowhere else. What zod does here
// is refuse obvious junk before a round-trip; it is not the rule.

const noteSchema = z.string().trim().max(NOTE_MAX).optional();

const requestSchema = z.object({
  requested_action: z.enum(SUPPLIER_CLAIM_REQUEST_KEYS),
  note: noteSchema,
});

const responseSchema = z.object({
  supplier_response: z.enum(SUPPLIER_CLAIM_RESPONSE_KEYS),
  note: noteSchema,
});

const closeSchema = z.object({ note: noteSchema });

/** POST /:id/request — what WE ask the supplier to do. */
supplierClaimsRouter.post("/:id/request", async (c) => {
  gate(c);
  const parsed = await parseJsonBody(c, requestSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("supplier_claim_record_request", {
    p_claim_id: c.req.param("id"),
    p_requested_action: parsed.data.requested_action,
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? {});
});

/** POST /:id/response — what the SUPPLIER answered. Does NOT close the claim:
 *  an answer is a promise, and the goods usually arrive days later. */
supplierClaimsRouter.post("/:id/response", async (c) => {
  gate(c);
  const parsed = await parseJsonBody(c, responseSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("supplier_claim_record_response", {
    p_claim_id: c.req.param("id"),
    p_response: parsed.data.supplier_response,
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? {});
});

/** POST /:id/close — settle it. The RPC refuses unless BOTH sides are on file
 *  (the card's done-when), so a claim can never close half-told. */
supplierClaimsRouter.post("/:id/close", async (c) => {
  gate(c);
  const parsed = await parseJsonBody(c, closeSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("supplier_claim_close", {
    p_claim_id: c.req.param("id"),
    p_note: parsed.data.note ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? {});
});

export default supplierClaimsRouter;
