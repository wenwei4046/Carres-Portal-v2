import { Hono } from "hono";
import { z } from "zod";
import { fail, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * PERSONAL SAVED COLUMN LAYOUTS (ui MASTER §6.7 rule 4 · Purchasing MASTER
 * §9.3 · migration 0528, Jess 2026-09-17).
 *
 * Every read and write runs as the CALLER (`userClient` with their JWT): RLS
 * returns only their own rows, and the two SQL doors act only on `auth.uid()`.
 * No route accepts a user id, so no request can read or change another
 * person's layouts. Purchase Orders is the only admitted listing.
 *
 * A layout is order, widths, visibility and sort — the schema below is
 * `.strict()`, and SQL refuses any other key as well, so search, filters and
 * group open/closed state can never be saved.
 */
const router = new Hono<AppEnv>();

export const REGISTER_LAYOUT_LISTINGS = ["purchase_orders"] as const;
export const REGISTER_LAYOUT_LIMIT = 10;

const layoutSchema = z
  .object({
    order: z.array(z.string().max(80)).max(80),
    hidden: z.array(z.string().max(80)).max(80),
    widths: z.record(z.string().max(80), z.number().int().min(24).max(2000)),
    sort: z.object({ key: z.string().max(80), dir: z.enum(["asc", "desc"]) }).strict().nullable(),
  })
  .strict();

const saveSchema = z
  .object({
    listing: z.enum(REGISTER_LAYOUT_LISTINGS),
    name: z.string().trim().min(1).max(60),
    layout: layoutSchema,
  })
  .strict();

router.get("/", async (c) => {
  const listing = c.req.query("listing");
  if (!REGISTER_LAYOUT_LISTINGS.includes(listing as (typeof REGISTER_LAYOUT_LISTINGS)[number])) {
    return c.json({ error: "invalid_query", code: "invalid_param", message: "unknown listing" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("register_personal_layouts")
    .select("id, name, layout, is_default, updated_at")
    .eq("listing", listing!)
    .order("name", { ascending: true });
  if (error) return fail(c, error);
  return c.json({ layouts: data ?? [], limit: REGISTER_LAYOUT_LIMIT });
});

router.post("/", async (c) => {
  const body = await parseJsonBody(c, saveSchema);
  if (!body.ok) return c.json(body.body, body.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("register_layout_save", {
    p_listing: body.data.listing,
    p_name: body.data.name,
    p_layout: body.data.layout,
  });
  if (error) {
    /* The 11th name is a rule the person can act on, never a server fault. */
    if (error.message?.includes("register_layout_limit")) {
      return c.json(
        { error: "rule_violation", code: "register_layout_limit", message: `You can keep ${REGISTER_LAYOUT_LIMIT} layouts` },
        422,
      );
    }
    return fail(c, error);
  }
  return c.json({ layout: data });
});

router.post("/:id/default", async (c) => {
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "invalid_param", code: "invalid_param", message: "invalid id" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("register_layout_set_default", { p_id: id });
  if (error) return fail(c, error);
  return c.json({ layout: data });
});

export default router;
