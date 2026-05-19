import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth";
import authRouter from "./routes/auth";
import catalogRouter from "./routes/catalog";
import dealerRouter from "./routes/dealers";
import ordersRouter from "./routes/orders";
import outletsRouter from "./routes/outlets";
import approvalsRouter from "./routes/principal/approvals";
import principalAccountsRouter from "./routes/principal/accounts";
import principalAuditRouter from "./routes/principal/audit";
import principalDashboardRouter from "./routes/principal/dashboard";
import principalDealersRouter from "./routes/principal/dealers";
import principalPartnersRouter from "./routes/principal/partners";
// 2026-05-19 — stock / orders-feed / suppliers-overview moved from principal/*
import operationStockRouter from "./routes/operation/stock";
import operationOrdersFeedRouter from "./routes/operation/orders-feed";
import operationSuppliersOverviewRouter from "./routes/operation/suppliers-overview";
import operationBadgesRouter from "./routes/operation/badges";
import operationDashboardRouter from "./routes/operation/dashboard";
import operationMovementsRouter from "./routes/operation/movements";
import operationOrdersRouter from "./routes/operation/orders";
import operationPartnersRouter from "./routes/operation/partners";
import operationPosRouter from "./routes/operation/pos";
import operationReceiveThreadsRouter from "./routes/operation/receive-threads";
import procurementTabsRouter from "./routes/operation/procurement-tabs";
import dispatchCustomerLegRouter from "./routes/operation/dispatch-customer-leg";
import lpInboundRouter from "./routes/operation/lp-inbound";
import resumeDispatchRouter from "./routes/operation/resume-dispatch";
import recentCostRouter from "./routes/operation/recent-cost";
import stockAlertsRouter from "./routes/operation/stock-alerts";
import thresholdsRouter from "./routes/operation/thresholds";
import operationSuppliersRouter from "./routes/operation/suppliers";
import operationWarehouseRouter from "./routes/operation/warehouse";
import bdDealersRouter from "./routes/bd/dealers";
import bdInquiriesRouter from "./routes/bd/inquiries";
import partnerDashboardRouter from "./routes/partner/dashboard";
import partnerFleetRouter from "./routes/partner/fleet";
import partnerPickupsRouter from "./routes/partner/pickups";
import partnerPickupsBatchRouter from "./routes/partner/pickups-batch";
import partnerPodRouter from "./routes/partner/pod";
import pickupEventsRouter from "./routes/pickup-events/print";
import financePaymentsRouter from "./routes/finance/payments";
import financeReportsRouter from "./routes/finance/reports";
import financeInvoicesRouter from "./routes/finance/invoices";
import financeRefundsRouter from "./routes/finance/refunds";
import financeReconciliationRouter from "./routes/finance/reconciliation";
import supplierActivityRouter from "./routes/supplier/activity";
import supplierMeRouter from "./routes/supplier/me";
import supplierPosRouter from "./routes/supplier/pos";
import supplierProductsRouter from "./routes/supplier/products";
import supplierThreadsRouter from "./routes/supplier/threads";
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
api.route("/principal/accounts", principalAccountsRouter);
api.route("/principal/audit", principalAuditRouter);
api.route("/principal/dashboard", principalDashboardRouter);
api.route("/principal/dealers", principalDealersRouter);
api.route("/principal/partners", principalPartnersRouter);
api.route("/salespersons", salespersonsRouter);
api.route("/operation/badges", operationBadgesRouter);
api.route("/operation/dashboard", operationDashboardRouter);
api.route("/operation/movements", operationMovementsRouter);
api.route("/operation/orders", operationOrdersRouter);
api.route("/operation/orders", resumeDispatchRouter);
api.route("/operation/partners", operationPartnersRouter);
api.route("/operation/pos", operationPosRouter);
api.route("/operation/pos", lpInboundRouter);
api.route("/operation/pos", dispatchCustomerLegRouter);
api.route("/operation/pos", operationReceiveThreadsRouter);
api.route("/operation/procurement", procurementTabsRouter);
api.route("/operation/skus", recentCostRouter);
api.route("/operation/stock-alerts", stockAlertsRouter);
api.route("/operation/stock", operationStockRouter);
api.route("/operation/orders-feed", operationOrdersFeedRouter);
api.route("/operation/suppliers-overview", operationSuppliersOverviewRouter);
api.route("/operation", thresholdsRouter);
api.route("/operation/suppliers", operationSuppliersRouter);
api.route("/operation/warehouse", operationWarehouseRouter);
api.route("/bd/dealers", bdDealersRouter);
api.route("/bd/inquiries", bdInquiriesRouter);
api.route("/partner/dashboard", partnerDashboardRouter);
api.route("/partner/fleet", partnerFleetRouter);
api.route("/partner/pickups", partnerPickupsRouter);
api.route("/partner/pickups", partnerPickupsBatchRouter);
api.route("/partner/pod", partnerPodRouter);
api.route("/pickup-events", pickupEventsRouter);
api.route("/finance/payments", financePaymentsRouter);
api.route("/finance/reports", financeReportsRouter);
api.route("/finance/invoices", financeInvoicesRouter);
api.route("/finance/refunds", financeRefundsRouter);
api.route("/finance", financeReconciliationRouter);
api.route("/supplier/activity", supplierActivityRouter);
api.route("/supplier/me", supplierMeRouter);
api.route("/supplier/pos", supplierPosRouter);
api.route("/supplier/products", supplierProductsRouter);
api.route("/supplier/threads", supplierThreadsRouter);
api.route("/storage/dos", dosRouter);

app.route("/api", api);

export default app;
