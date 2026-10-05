/**
 * Every module door that can write a completion fact carries the Completed
 * writer, for exactly its own rules — proven by replacing the writer with a
 * probe that answers instead of the door.
 */
import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../types";

vi.mock("./sales-order-work-completion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sales-order-work-completion")>();
  return {
    ...actual,
    salesOrderWorkCompletion: (opts: { rules: string[] }) =>
      async (c: { json: (b: unknown) => Response }) => c.json({ wired: opts.rules }),
  };
});

vi.mock("./purchasing-work-completion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./purchasing-work-completion")>();
  return {
    ...actual,
    poSentWorkCompletion: () => async (c: { json: (b: unknown) => Response }) => c.json({ wired: ["purchasing.po_window"] }),
    supplierReplyWorkCompletion: () => async (c: { json: (b: unknown) => Response }) =>
      c.json({ wired: ["purchasing.supplier_date_passed"] }),
    arrivalConfirmationWorkCompletion: () => async (c: { json: (b: unknown) => Response }) =>
      c.json({ wired: ["purchasing.confirm_tomorrows_delivery"] }),
  };
});

vi.mock("./warehouse-repair-return-work",()=>({
  withWarehouseRepairReturnCompletion: (c:{json:(body:unknown)=>Response},sourceId:string|undefined)=>
    c.json({wired:["repair_order.return_date_passed"],sourceId}),
}));
const {default: warehouseReceivingRouter}=await import("../routes/warehouse/receiving");

const { default: ordersRouter } = await import("../routes/orders");
const { default: toOrderRouter } = await import("../routes/operation/to-order");
const { default: operationPosRouter } = await import("../routes/operation/pos");
const { default: operationOrdersRouter } = await import("../routes/operation/orders");
const { default: orderControlRouter } = await import("../routes/operation/order-control");

function mount(role: string) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", { id: "u", email: "u@carres.test", role, dealerId: null, warehouseId:role==="warehouse"?"11111111-0000-4000-8000-000000000001":null, jwt: "jwt" } as never);
    await next();
  });
  app.route("/api/warehouse",warehouseReceivingRouter);
  app.route("/api/orders", ordersRouter);
  app.route("/api/operation/orders", operationOrdersRouter);
  app.route("/api/operation/orders", orderControlRouter);
  app.route("/api/operation/to-order", toOrderRouter);
  app.route("/api/operation/pos", operationPosRouter);
  return app;
}

const ORDER = "11111111-0000-4000-8000-000000000001";
const post = async (app: Hono<AppEnv>, path: string) =>
  (await app.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();

describe("the Purchasing doors that complete Work", () => {
  it("PO sent to supplier completes the PO window it was issued from", async () => {
    expect(await post(mount("operation"), "/api/operation/pos/PO2609-4827/confirm-sent")).toEqual({ wired: ["purchasing.po_window"] });
  });
  it("the SO Batch issue completes nothing — issuing is not sending", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../routes/operation/to-order.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/WorkCompletion/);
  });
  it("the recorded supplier answer completes only the passed-date follow-up", async () => {
    expect(await post(mount("operation"), "/api/operation/pos/PO2609-4827/tomorrow-delivery"))
      .toEqual({ wired: ["purchasing.supplier_date_passed"] });
  });
  it("the Supplier DO / evidenced confirmation completes the day-before check", async () => {
    expect(await post(mount("operation"), "/api/operation/pos/PO2609-4827/arrival-confirmation"))
      .toEqual({ wired: ["purchasing.confirm_tomorrows_delivery"] });
  });
});

describe("the Sales Orders doors that complete Work", () => {
  it("the date door completes ask_delivery_date", async () => {
    expect(await post(mount("operation"), `/api/orders/${ORDER}/date`)).toEqual({ wired: ["ask_delivery_date"] });
  });
  it("the office save completes ask_delivery_date", async () => {
    expect(await post(mount("operation"), `/api/operation/orders/${ORDER}/save`)).toEqual({ wired: ["ask_delivery_date"] });
  });
  it("an approved amendment completes ask_delivery_date", async () => {
    expect(await post(mount("principal"), "/api/operation/orders/amendment/a-1/decide")).toEqual({ wired: ["ask_delivery_date"] });
  });
  it("the delay decision completes delay_planning", async () => {
    expect(await post(mount("operation"), `/api/operation/orders/${ORDER}/delay-decision`)).toEqual({ wired: ["delay_planning"] });
  });
});

it("Warehouse final confirmation carries the source-scoped return consequence after its role and input guards",async()=>{
  const body=JSON.stringify({saveKey:ORDER,report:{arrivalSourceId:ORDER}});
  const response=await mount("warehouse").request("/api/warehouse/receipts/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body});
  expect(await response.json()).toEqual({wired:["repair_order.return_date_passed"],sourceId:ORDER});
  const refused=await mount("operation").request("/api/warehouse/receipts/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body});
  expect(refused.status).toBe(403);
});
