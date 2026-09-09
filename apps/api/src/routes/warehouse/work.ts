import { Hono, type Context } from "hono";
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

function malaysiaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export async function loadWarehouseWork(c: Context<AppEnv>): Promise<OperationWorkResponse> {
  const internal = new Hono<AppEnv>();
  internal.use("*", async (child, next) => { child.set("auth", c.var.auth); await next(); });
  internal.route("/delivery-arrangements", deliveryArrangementsRouter);
  const scheduleResponse = await internal.request("/delivery-arrangements/warehouse-schedule");
  if (!scheduleResponse.ok) throw new Error("Warehouse Outbound source could not be read");
  const schedule = await scheduleResponse.json() as { events: DeliveryWarehouseScheduleEvent[] };

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("warehouse_my_outbound_assignments");
  if (error) throw new Error("Warehouse owner source could not be read");
  const source = (data ?? {}) as {
    site?: { id: string; label: string };
    assignments?: WarehouseOutboundAssignment[];
  };
  if (!source.site) throw new Error("This warehouse login has no governed Site");
  const today = malaysiaToday();
  const assignments = source.assignments ?? [];
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
