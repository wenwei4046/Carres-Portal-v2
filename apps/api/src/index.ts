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
import logisticsBadgesRouter from "./routes/logistics/badges";
import logisticsDashboardRouter from "./routes/logistics/dashboard";
import logisticsMovementsRouter from "./routes/logistics/movements";
import logisticsOrdersRouter from "./routes/logistics/orders";
import logisticsPartnersRouter from "./routes/logistics/partners";
import logisticsPosRouter from "./routes/logistics/pos";
import procurementTabsRouter from "./routes/logistics/procurement-tabs";
import dispatchCustomerLegRouter from "./routes/logistics/dispatch-customer-leg";
import lpInboundRouter from "./routes/logistics/lp-inbound";
import resumeDispatchRouter from "./routes/logistics/resume-dispatch";
import recentCostRouter from "./routes/logistics/recent-cost";
import stockAlertsRouter from "./routes/logistics/stock-alerts";
import thresholdsRouter from "./routes/logistics/thresholds";
import logisticsSuppliersRouter from "./routes/logistics/suppliers";
import logisticsWarehouseRouter from "./routes/logistics/warehouse";
import bdInquiriesRouter from "./routes/bd/inquiries";
import partnerDashboardRouter from "./routes/partner/dashboard";
import partnerFleetRouter from "./routes/partner/fleet";
import partnerPickupsRouter from "./routes/partner/pickups";
import partnerPodRouter from "./routes/partner/pod";
import financePaymentsRouter from "./routes/finance/payments";
import financeReportsRouter from "./routes/finance/reports";
import financeInvoicesRouter from "./routes/finance/invoices";
import financeRefundsRouter from "./routes/finance/refunds";
import financeReconciliationRouter from "./routes/finance/reconciliation";
import supplierActivityRouter from "./routes/supplier/activity";
import supplierMeRouter from "./routes/supplier/me";
import supplierPosRouter from "./routes/supplier/pos";
import supplierProductsRouter from "./routes/supplier/products";
import salespersonsRouter from "./routes/salespersons";
import dosRouter from "./routes/storage/dos";
import opsOrdersRouter from "./routes/ops/orders";
import opsActivityRouter from "./routes/ops/activity";
import opsStockRouter from "./routes/ops/stock";
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
api.route("/logistics/badges", logisticsBadgesRouter);
api.route("/logistics/dashboard", logisticsDashboardRouter);
api.route("/logistics/movements", logisticsMovementsRouter);
api.route("/logistics/orders", logisticsOrdersRouter);
api.route("/logistics/orders", resumeDispatchRouter);
api.route("/logistics/partners", logisticsPartnersRouter);
api.route("/logistics/pos", logisticsPosRouter);
api.route("/logistics/pos", lpInboundRouter);
api.route("/logistics/pos", dispatchCustomerLegRouter);
api.route("/logistics/procurement", procurementTabsRouter);
api.route("/logistics/skus", recentCostRouter);
api.route("/logistics/stock-alerts", stockAlertsRouter);
api.route("/logistics", thresholdsRouter);
api.route("/logistics/suppliers", logisticsSuppliersRouter);
api.route("/logistics/warehouse", logisticsWarehouseRouter);
api.route("/bd/inquiries", bdInquiriesRouter);
api.route("/partner/dashboard", partnerDashboardRouter);
api.route("/partner/fleet", partnerFleetRouter);
api.route("/partner/pickups", partnerPickupsRouter);
api.route("/partner/pod", partnerPodRouter);
api.route("/finance/payments", financePaymentsRouter);
api.route("/finance/reports", financeReportsRouter);
api.route("/finance/invoices", financeInvoicesRouter);
api.route("/finance/refunds", financeRefundsRouter);
api.route("/finance", financeReconciliationRouter);
api.route("/supplier/activity", supplierActivityRouter);
api.route("/supplier/me", supplierMeRouter);
api.route("/supplier/pos", supplierPosRouter);
api.route("/supplier/products", supplierProductsRouter);
api.route("/storage/dos", dosRouter);
// Ops Panel (Jess COO 2026-05-14) — Phase 1: orders import/inbox + activity feed.
api.route("/ops/orders", opsOrdersRouter);
api.route("/ops/activity", opsActivityRouter);
api.route("/ops/stock", opsStockRouter);

app.route("/api", api);

export default app;
