import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../types";

/**
 * /api/it-support — report a problem to IT.
 *
 * The request does not live in this database. It lives in the Houzs IT Hub
 * (support.houzscentury.com), the one inbox the developers work for every
 * system. This route is the only thing that talks to it, server to server, the
 * same way the 2990s POS, Hookka ERP and Houzs ERP do:
 *
 *   browser --session--> /api/it-support/tickets --Bearer key + X-Reporter-Id--> hub
 *
 * Two rules hold it together:
 *   1. The hub key (IT_HUB_API_KEY) is a Worker secret and never leaves the Worker.
 *   2. WHO is reporting is read off the verified session (`c.var.auth`), never
 *      off the request body. The hub shows a reporter only their own requests,
 *      keyed on X-Reporter-Id.
 *
 * Gate: any signed-in account, like Houzs ERP. Every row is the caller's own.
 * "Could not ask the hub" is answered as that (501 not set up, 502 hub down),
 * never as success. A hub 401 means OUR key is wrong, so it is answered 502:
 * passing a 401 through would read as the user's own session expiring.
 */
const itSupportRouter = new Hono<AppEnv>();

const HUB_TIMEOUT_MS = 20_000;

const NOT_CONNECTED = "IT Support is not connected yet. Please tell IT directly for now.";
const UNREACHABLE = "IT Support could not be reached. Please try again in a moment.";

// What the browser may set. Reporter, role and user agent are filled in here.
const ticketInput = z.object({
  title: z.string().trim().min(1, "Say in a few words what the problem is.").max(200),
  description: z.string().trim().max(10_000).optional(),
  type: z.enum(["bug", "development"]).optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  // http(s) only: the Hub shows it as a link, so `javascript:` must not get through.
  page_url: z.string().trim().max(1000).url().refine((u) => /^https?:\/\//i.test(u), "Page address must be a web address.").optional(),
  app_version: z.string().trim().max(60).optional(),
});

itSupportRouter.post("/tickets", async (c) => {
  const base = (c.env.IT_HUB_URL ?? "").trim().replace(/\/+$/, "");
  const key = (c.env.IT_HUB_API_KEY ?? "").trim();
  if (!base || !key) return c.json({ error: "not_connected", message: NOT_CONNECTED }, 501);

  const parsed = ticketInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Some details are missing." });
  }

  const { auth } = c.var;
  const out = new FormData();
  for (const [k, v] of Object.entries(parsed.data)) if (v) out.set(k, v);
  out.set("reporter_name", auth.email);
  out.set("reporter_email", auth.email);
  out.set("reporter_department", auth.role);
  const agent = c.req.header("User-Agent");
  if (agent) out.set("user_agent", agent.slice(0, 500));

  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/sys/tickets`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "X-Reporter-Id": auth.id },
      body: out,
      signal: AbortSignal.timeout(HUB_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn("[it-support] hub unreachable:", err instanceof Error ? err.message : String(err));
    return c.json({ error: "hub_unreachable", message: UNREACHABLE }, 502);
  }

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  // The hub took it; an unreadable reply must not read as failure, or the user re-sends a duplicate.
  if (res.ok) return c.json(body ?? {}, 201);
  if (res.status === 400 && typeof body?.error === "string") {
    return c.json({ error: "invalid_body", message: body.error }, 400);
  }
  console.warn(`[it-support] hub answered ${res.status}: ${typeof body?.error === "string" ? body.error : ""}`);
  return c.json({ error: "hub_unreachable", message: UNREACHABLE }, 502);
});

export default itSupportRouter;
