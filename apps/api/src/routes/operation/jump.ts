import { Hono } from "hono";
import {
  grnSearchTerm,
  numericPrefixRanges,
  parseJumpQuery,
  rankJumpDocuments,
  type JumpDocumentResult,
} from "@carres/shared";
import { requireOperation } from "../../lib/auth-guards";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/operation/jump?q= — the document half of `Jump to…`
 * (`docs/ui/MASTER.md`, `JUMP TO… INTERACTION`, APPROVED / LOCKED 2026-08-11).
 *
 * The locked contract gives the global command surface exactly two things to
 * search, and this router owns the second: **exact or partial governed document
 * numbers — SO · PO · GRN · INV**. The first (governed module / destination
 * names) never reaches the network: the browser resolves it from the same
 * portal nav the sidebar reads, so a destination costs no round trip and a
 * destination the operator may not open is never even composed.
 *
 * ⭐ PERMISSION-FILTERED BEFORE DISPLAY, and filtered by the DATABASE.
 *
 *   1. `requireOperation` — only `operation` and `principal` reach this route
 *      at all. The surface exists on the Operations shell; every other role
 *      collects a 403 and therefore an empty result, never a filtered one.
 *   2. `userClient(env, jwt)` — every read below runs under the CALLER'S OWN
 *      token, so `orders_scoped_read`, `po_scoped_read`,
 *      `warehouse_receipts_read_internal` and `invoices_scoped_read` decide
 *      what exists. A row the caller may not select is not filtered out of the
 *      response; it is never returned to the Worker.
 *
 * Neither layer is the other's backup — the guard keeps the wrong role off the
 * route, RLS keeps the wrong ROWS off the reply, and the route holds no
 * allowlist of its own that could drift from either.
 *
 * ⛔ NAVIGATE-ONLY. There is no POST, no PATCH and no create. Every entry this
 * returns carries an `href` into the destination that OWNS the document, and
 * that is the whole of what selecting a result may do.
 *
 * It does NOT search customer names, phone numbers, product text or arbitrary
 * table cells. That is the Register's own page-owned Search, and the MASTER
 * keeps the two apart on purpose: widening this set needs a governed
 * cross-module search index and a new architecture decision, not a filter here.
 */
const jumpRouter = new Hono<AppEnv>();

/** Per type. Small on purpose: the surface is a keyboard jump, not a report. */
const PER_TYPE = 5;
/** Across all four. A list past this is scrolled, and scrolling is the Register's job. */
const TOTAL = 12;

/**
 * Strip everything that is not part of a governed document number before the
 * value reaches a PostgREST filter.
 *
 * `ilike` treats `%` and `_` as wildcards and PostgREST's `or()`/`in()` grammar
 * is comma- and parenthesis-delimited, so an unsanitised query is both a
 * broken filter and a way to widen someone else's search. Document numbers are
 * `[A-Z0-9-]` and nothing else, which makes the allowlist exact rather than a
 * guess at what to escape.
 */
function docNumberSafe(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

jumpRouter.get("/", requireOperation, async (c) => {
  const auth = c.var.auth;
  const parsed = parseJumpQuery(c.req.query("q") ?? "");
  /* Nothing typed is not an error and not a whole-book dump: the surface shows
   * recent and permitted DESTINATIONS at that point, which are the browser's. */
  if (parsed.raw === "") return c.json({ documents: [] });

  const sb = userClient(c.env, auth.jwt);
  const wants = (t: (typeof parsed.types)[number]) => parsed.types.includes(t);
  const needle = docNumberSafe(parsed.term !== "" ? parsed.term : parsed.raw);
  const documents: JumpDocumentResult[] = [];

  // ── SO ────────────────────────────────────────────────────────────────────
  // `orders.so` is an `integer`, so a partial number cannot be `ILIKE`d. The
  // prefix becomes half-open ranges instead (`13` → [1300,1400) …), which is
  // both exact and indexed. A query with no digits matches no SO at all —
  // typing a customer's name here is the Register's search, not this one.
  if (wants("SO") && parsed.digits !== "") {
    const ranges = numericPrefixRanges(parsed.digits);
    if (ranges.length > 0) {
      const { data, error } = await sb
        .from("orders")
        .select("id, so, customer_name")
        .or(ranges.map((r) => `and(so.gte.${r.gte},so.lt.${r.lt})`).join(","))
        .order("so", { ascending: false })
        .limit(PER_TYPE);
      if (error) {
        const m = mapPgError(error);
        return c.json(m.body, m.status);
      }
      for (const row of (data ?? []) as Array<{
        id: string;
        so: number | null;
        customer_name: string | null;
      }>) {
        if (row.so == null) continue;
        documents.push({
          type: "SO",
          number: `SO-${row.so}`,
          party: row.customer_name,
          href: `/operation/orders/so/${row.id}`,
        });
      }
    }
  }

  // ── PO ────────────────────────────────────────────────────────────────────
  // A purchase order's id IS its number (`PO-2051`), so the number is the key
  // and `ilike` matches the paper spelling and the bare digits alike.
  if (wants("PO") && needle !== "") {
    const { data, error } = await sb
      .from("purchase_orders")
      .select("id, suppliers(name)")
      .ilike("id", `%${needle}%`)
      .order("id", { ascending: false })
      .limit(PER_TYPE);
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    for (const row of (data ?? []) as Array<{
      id: string;
      suppliers: { name: string | null } | Array<{ name: string | null }> | null;
    }>) {
      const sup = Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers;
      documents.push({
        type: "PO",
        number: row.id,
        party: sup?.name ?? null,
        href: `/operation/procurement?po=${encodeURIComponent(row.id)}`,
      });
    }
  }

  // ── GRN ───────────────────────────────────────────────────────────────────
  // Only a posted document and its amended/voided history owns a formal stored
  // GRN number. Draft, submitted and returned counts have no GRN to jump to.
  // Search that indexed identity directly: the GRN posting date is deliberately
  // independent from the physical Goods Received At fact.
  if (wants("GRN")) {
    const storedNeedle = grnSearchTerm(
      parsed.types.length === 1 ? parsed.term : parsed.raw,
    );
    if (storedNeedle) {
      const { data, error } = await sb
      .from("warehouse_receipts")
        .select("id, grn_number, purchase_orders(id, suppliers(name))")
        .in("status", ["posted", "amended", "voided"])
        .ilike("grn_number", `%${storedNeedle}%`)
        .order("grn_number", { ascending: false })
        .limit(PER_TYPE);
      if (error) {
        const m = mapPgError(error);
        return c.json(m.body, m.status);
      }
      for (const row of (data ?? []) as Array<{
        id: string;
        grn_number: string | null;
        purchase_orders:
          | { id: string; suppliers: { name: string | null } | Array<{ name: string | null }> | null }
          | Array<{ id: string; suppliers: { name: string | null } | Array<{ name: string | null }> | null }>
          | null;
      }>) {
        if (!row.grn_number) continue;
        const po = Array.isArray(row.purchase_orders) ? row.purchase_orders[0] : row.purchase_orders;
        const sup = Array.isArray(po?.suppliers) ? po?.suppliers[0] : po?.suppliers;
        documents.push({
          type: "GRN",
          number: row.grn_number,
          party: sup?.name ?? null,
          href: `/operation?tab=receiving&queue=received&receipt=${encodeURIComponent(row.id)}`,
        });
      }
    }
  }

  // ── INV ───────────────────────────────────────────────────────────────────
  // An invoice is a document OF an order — `invoices.order_id`, and the same
  // number lands on `orders.invoice_no` — so its owning destination is that
  // order's workspace, which is also where the paper is read and reprinted.
  // Both sides are searched because the trigger writes the order column and
  // finance mints the row, and a jump must not depend on which happened first.
  if (wants("INV") && needle !== "") {
    const [invRes, ordRes] = await Promise.all([
      sb
        .from("invoices")
        .select("invoice_no, order_id, orders(customer_name)")
        .ilike("invoice_no", `%${needle}%`)
        .limit(PER_TYPE),
      sb
        .from("orders")
        .select("id, invoice_no, customer_name")
        .ilike("invoice_no", `%${needle}%`)
        .limit(PER_TYPE),
    ]);
    if (invRes.error) {
      const m = mapPgError(invRes.error);
      return c.json(m.body, m.status);
    }
    if (ordRes.error) {
      const m = mapPgError(ordRes.error);
      return c.json(m.body, m.status);
    }
    for (const row of (invRes.data ?? []) as Array<{
      invoice_no: string;
      order_id: string;
      orders: { customer_name: string | null } | Array<{ customer_name: string | null }> | null;
    }>) {
      const ord = Array.isArray(row.orders) ? row.orders[0] : row.orders;
      documents.push({
        type: "INV",
        number: row.invoice_no,
        party: ord?.customer_name ?? null,
        href: `/operation/orders/so/${row.order_id}`,
      });
    }
    for (const row of (ordRes.data ?? []) as Array<{
      id: string;
      invoice_no: string | null;
      customer_name: string | null;
    }>) {
      if (!row.invoice_no) continue;
      documents.push({
        type: "INV",
        number: row.invoice_no,
        party: row.customer_name,
        href: `/operation/orders/so/${row.id}`,
      });
    }
  }

  /* One number is one document however many tables named it — an invoice found
   * on both `invoices` and `orders.invoice_no` is not two results. */
  const seen = new Set<string>();
  const unique = documents.filter((d) => {
    const key = `${d.type}:${d.number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return c.json({ documents: rankJumpDocuments(unique, parsed.raw).slice(0, TOTAL) });
});

export default jumpRouter;
