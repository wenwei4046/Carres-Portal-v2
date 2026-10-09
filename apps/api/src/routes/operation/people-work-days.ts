import { Hono } from "hono";
import { readPersonWorkDays } from "../../lib/person-work-days";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/operation/people/work-days?ids=<uuid>,<uuid> — the recorded
 * normal working weekdays of the named people (People/HR, 0677), for screens
 * that step an action day back on the responsible person's own week (the
 * Payment Monitor, Pay by, the collection workspace). Read-only: the week is
 * edited only in People (HR person drawer). A person not in the answer has
 * no recorded week — the Office working weekdays apply.
 */
const peopleWorkDaysRouter = new Hono<AppEnv>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

peopleWorkDaysRouter.get("/work-days", async (c) => {
  const role = c.var.auth?.role;
  if (role !== "operation" && role !== "principal" && role !== "finance") {
    return c.json({ error: "forbidden", message: "Carres staff only" }, 403);
  }
  const ids = (c.req.query("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID.test(s))
    .slice(0, 200);
  const map = await readPersonWorkDays(userClient(c.env, c.var.auth.jwt), ids);
  return c.json({ workDays: Object.fromEntries(map) });
});

export default peopleWorkDaysRouter;
