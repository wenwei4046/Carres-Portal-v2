import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  operationWorkResponseSchema,
  projectWarehouseOutboundWork,
  warehouseOutboundCards,
  type DeliveryWarehouseScheduleEvent,
  type OperationWorkResponse,
  type WarehouseOutboundAssignment,
} from "@carres/shared";
import { requireWarehouse } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";
import deliveryArrangementsRouter from "../operation/delivery-arrangements";

const warehouseWorkSourceSchema = z.object({
  site: z.object({ id: z.string().uuid(), label: z.string().min(1) }).strict(),
  assignments: z.array(z.object({
    deliveryOrderId: z.string().uuid(),
    siteId: z.string().uuid(),
    userId: z.string().uuid(),
    name: z.string().nullable(),
    acceptedAt: z.string().min(1),
  }).strict()),
}).strict();

function malaysiaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export async function loadWarehouseWork(c: Context<AppEnv>): Promise<OperationWorkResponse> {
  const internal = new Hono<AppEnv>();
  internal.use("*", async (child, next) => { child.set("auth", c.var.auth); await next(); });
  internal.route("/delivery-arrangements", deliveryArrangementsRouter);
  const scheduleResponse = await internal.request("/delivery-arrangements/warehouse-schedule", {}, c.env);
  if (!scheduleResponse.ok) throw new Error("Warehouse Outbound source could not be read");
  const schedule = await scheduleResponse.json() as { events: DeliveryWarehouseScheduleEvent[] };
  if (!Array.isArray(schedule.events)) throw new Error("Warehouse Outbound source could not be read");

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("warehouse_my_outbound_assignments");
  if (error) throw new Error("Warehouse owner source could not be read");
  const source = warehouseWorkSourceSchema.parse(data ?? {});
  const today = malaysiaToday();
  const assignments: WarehouseOutboundAssignment[] = source.assignments;
  return operationWorkResponseSchema.parse({
    items: projectWarehouseOutboundWork({
      cards: warehouseOutboundCards(schedule.events ?? []),
      site: source.site,
      assignments,
      today,
    }),
    // External Warehouse scope never receives the Carres Team directory.
    staff: [],
    generatedOn: today,
  });
}

export function createWarehouseWorkRouter(
  loader: (c: Context<AppEnv>) => Promise<OperationWorkResponse> = loadWarehouseWork,
): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  router.get("/", requireWarehouse, async (c) => c.json(await loader(c)));
  router.post("/:deliveryOrderId/accept", requireWarehouse, async (c) => {
    const sb = userClient(c.env, c.var.auth.jwt);
    const { data, error } = await sb.rpc("warehouse_accept_outbound_work", {
      p_do_id: c.req.param("deliveryOrderId"),
    });
    if (error) return c.json({ error: "outbound_accept_failed", message: error.message }, 409);
    return c.json(data);
  });
  return router;
}

export default createWarehouseWorkRouter();
