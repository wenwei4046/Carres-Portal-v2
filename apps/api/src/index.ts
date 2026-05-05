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
import principalPartnersRouter from "./routes/principal/partners";
import logisticsDashboardRouter from "./routes/logistics/dashboard";
import logisticsMovementsRouter from "./routes/logistics/movements";
import logisticsOrdersRouter from "./routes/logistics/orders";
import logisticsPartnersRouter from "./routes/logistics/partners";
import logisticsPosRouter from "./routes/logistics/pos";
import dispatchCustomerLegRouter from "./routes/logistics/dispatch-customer-leg";
import lpInboundRouter from "./routes/logistics/lp-inbound";
import resumeDispatchRouter from "./routes/logistics/resume-dispatch";
import stockAlertsRouter from "./routes/logistics/stock-alerts";
import thresholdsRouter from "./routes/logistics/thresholds";
import logisticsSuppliersRouter from "./routes/logistics/suppliers";
import logisticsWarehouseRouter from "./routes/logistics/warehouse";
import partnerDashboardRouter from "./routes/partner/dashboard";
import partnerPickupsRouter from "./routes/partner/pickups";
import salespersonsRouter from "./routes/salespersons";
import dosRouter from "./routes/storage/dos";
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
api.route("/principal/partners", principalPartnersRouter);
api.route("/salespersons", salespersonsRouter);
api.route("/logistics/dashboard", logisticsDashboardRouter);
api.route("/logistics/movements", logisticsMovementsRouter);
api.route("/logistics/orders", logisticsOrdersRouter);
api.route("/logistics/orders", resumeDispatchRouter);
api.route("/logistics/partners", logisticsPartnersRouter);
api.route("/logistics/pos", logisticsPosRouter);
api.route("/logistics/pos", lpInboundRouter);
api.route("/logistics/pos", dispatchCustomerLegRouter);
api.route("/logistics/stock-alerts", stockAlertsRouter);
api.route("/logistics", thresholdsRouter);
api.route("/logistics/suppliers", logisticsSuppliersRouter);
api.route("/logistics/warehouse", logisticsWarehouseRouter);
api.route("/partner/dashboard", partnerDashboardRouter);
api.route("/partner/pickups", partnerPickupsRouter);
api.route("/storage/dos", dosRouter);

app.route("/api", api);

export default app;
