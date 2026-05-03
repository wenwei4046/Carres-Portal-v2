import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth";
import authRouter from "./routes/auth";
import catalogRouter from "./routes/catalog";
import dealerRouter from "./routes/dealers";
import ordersRouter from "./routes/orders";
import outletsRouter from "./routes/outlets";
import approvalsRouter from "./routes/principal/approvals";
import principalDashboardRouter from "./routes/principal/dashboard";
import principalDealersRouter from "./routes/principal/dealers";
import logisticsDashboardRouter from "./routes/logistics/dashboard";
import logisticsOrdersRouter from "./routes/logistics/orders";
import logisticsPosRouter from "./routes/logistics/pos";
import logisticsWarehouseRouter from "./routes/logistics/warehouse";
import salespersonsRouter from "./routes/salespersons";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use("*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  maxAge: 600,
}));

app.get("/health", (c) => c.json({ ok: true }));

const api = new Hono<AppEnv>();
api.use("*", authMiddleware);
api.route("/approvals", approvalsRouter);
api.route("/auth", authRouter);
api.route("/dealers", dealerRouter);
api.route("/orders", ordersRouter);
api.route("/catalog", catalogRouter);
api.route("/outlets", outletsRouter);
api.route("/principal/dashboard", principalDashboardRouter);
api.route("/principal/dealers", principalDealersRouter);
api.route("/salespersons", salespersonsRouter);
api.route("/logistics/dashboard", logisticsDashboardRouter);
api.route("/logistics/orders", logisticsOrdersRouter);
api.route("/logistics/pos", logisticsPosRouter);
api.route("/logistics/warehouse", logisticsWarehouseRouter);

app.route("/api", api);

export default app;
