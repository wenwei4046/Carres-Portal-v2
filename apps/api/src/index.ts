import { Hono } from "hono";
import { cors } from "hono/cors";
import { authMiddleware } from "./middleware/auth";
import analyticsRouter from "./routes/analytics";
import authRouter from "./routes/auth";
import catalogRouter from "./routes/catalog";
import dealerRouter from "./routes/dealers";
import ordersRouter from "./routes/orders";
import pwpCodesRouter from "./routes/pwp-codes";
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
import deliveryChainRouter from "./routes/operation/delivery-chain";
import orderControlRouter from "./routes/operation/order-control";
import purchaseRouter from "./routes/operation/purchase";
import opsStaffRouter from "./routes/operation/staff";
import poDutyRouter from "./routes/operation/po-duty";
import orderPaymentsRouter from "./routes/operation/order-payments";
import bulkCompleteRouter from "./routes/operation/bulk-complete";
import operationPaymentsRouter from "./routes/operation/payments";
import lpInboundRouter from "./routes/operation/lp-inbound";
import resumeDispatchRouter from "./routes/operation/resume-dispatch";
import recentCostRouter from "./routes/operation/recent-cost";
import stockAlertsRouter from "./routes/operation/stock-alerts";
import thresholdsRouter from "./routes/operation/thresholds";
import operationSuppliersRouter from "./routes/operation/suppliers";
import operationWarehouseRouter from "./routes/operation/warehouse";
// 0174 — Sales Order Maintenance (AutoCount-style configurable SO grid).
import salesOrderMaintenanceRouter from "./routes/operation/sales-order-maintenance";
import bdAccountsRouter from "./routes/bd/accounts";
import bdDealersRouter from "./routes/bd/dealers";
import bdInquiriesRouter from "./routes/bd/inquiries";
import partnerDashboardRouter from "./routes/partner/dashboard";
import partnerFleetRouter from "./routes/partner/fleet";
import partnerOrdersRouter from "./routes/partner/orders";
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
import hrRouter from "./routes/hr";
// 0233 — staff PIN login (outlet pick + 6-digit-PIN staff identity + tiers).
import staffRouter from "./routes/staff";
// 0240 — store-account self-service (dealer-principal email-change requests).
import accountRouter from "./routes/account";
import dosRouter from "./routes/storage/dos";
// Phase A step 5 (migration 0137) — per-unit stock register.
import opsStockRouter from "./routes/ops/stock";
// Migration 0140 — Service Notes (SN / Issue Tracker).
import snRouter from "./routes/ops/service-notes";
// Migration 0210 — Service Cases (case parent layer above Service Notes).
import scRouter from "./routes/ops/service-cases";
// Migration 0162 — ops cockpit: Keep notes + Tasks board.
import opsNotesRouter from "./routes/ops/notes";
import opsTasksRouter from "./routes/ops/tasks";
// Phase B (migration 0138) — order annotations + activity timeline.
import annotationsRouter, { escalationsRouter } from "./routes/operation/annotations";
// Order activity history (P1) — the global cross-order activity feed.
import activityRouter from "./routes/operation/activity";
// Migration 0223 — Stripe online collection (POS checkout links + webhook).
import stripeCheckoutRouter from "./routes/stripe-checkout";
import stripeWebhookRouter from "./routes/stripe-webhook";
import { runContactByCron, runFollowUpMaintenanceCron } from "./cron/contact-by";
import { runPoDutyCron } from "./cron/po-duty";
import type { AppEnv, Bindings } from "./types";

const app = new Hono<AppEnv>();

// POS/ERP domain split (2026-07-18) — CORS narrowed from "*" (the Phase 9
// signed-off risk, now closed): only the two portal domains, the two Pages
// projects (hash previews included), and local dev may call from a browser.
// Server-to-server callers (Stripe webhook, cron) send no Origin header and
// are untouched — CORS is browser-enforced only.
// X-Staff-Token joined allowHeaders with the 0233 staff sessions: without it
// browsers reject PIN-authenticated calls at preflight.
const ALLOWED_BROWSER_ORIGIN =
  /^https:\/\/((pos|erp)\.carresofficial\.com|([a-z0-9-]+\.)?(carres-portal|carres-pos)\.pages\.dev)$|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use("*", cors({
  origin: (origin) => (ALLOWED_BROWSER_ORIGIN.test(origin) ? origin : null),
  allowHeaders: ["Content-Type", "Authorization", "X-Staff-Token"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  maxAge: 600,
}));

// Global error handler — ensures unhandled throws return JSON (not a
// connection reset that causes "Failed to fetch" in the browser).
app.onError((err, c) => {
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error ? err.message : "Internal server error";
  return c.json({ error: "server_error", message }, status as 400 | 401 | 403 | 404 | 422 | 500);
});

app.get("/health", (c) => c.json({ ok: true }));

// Stripe webhook — OUTSIDE the auth'd /api group (Stripe signs the request;
// there is no Supabase JWT). Signature verification is the trust boundary.
app.route("/stripe", stripeWebhookRouter);

const api = new Hono<AppEnv>();
api.use("*", authMiddleware);
// POS-parity — MAINTAIN → Sales analysis flattened feed (principal only).
api.route("/analytics", analyticsRouter);
api.route("/approvals", approvalsRouter);
api.route("/auth", authRouter);
api.route("/dealers", dealerRouter);
api.route("/orders", ordersRouter);
api.route("/pwp-codes", pwpCodesRouter);
api.route("/catalog", catalogRouter);
api.route("/outlets", outletsRouter);
api.route("/principal/accounts", principalAccountsRouter);
api.route("/principal/audit", principalAuditRouter);
api.route("/principal/dashboard", principalDashboardRouter);
api.route("/principal/dealers", principalDealersRouter);
api.route("/principal/partners", principalPartnersRouter);
api.route("/salespersons", salespersonsRouter);
api.route("/hr", hrRouter);
api.route("/staff", staffRouter);
api.route("/account", accountRouter);
api.route("/operation/badges", operationBadgesRouter);
api.route("/operation/dashboard", operationDashboardRouter);
api.route("/operation/movements", operationMovementsRouter);
api.route("/operation/orders", operationOrdersRouter);
api.route("/operation/orders", resumeDispatchRouter);
// 0156 γ multi-leg — PUT /:id/delivery-chain + PATCH /:id/delivery-stops/:leg
api.route("/operation/orders", deliveryChainRouter);
// 0159 P2 control overlay — GET + PUT /:id/control
api.route("/operation/orders", orderControlRouter);
// 0184 balance job — payment ledger + storage collect / waiver / delivery gate
api.route("/operation/orders", orderPaymentsRouter);
// 0223 Stripe online collection — POST/GET /orders/:id/stripe/checkout[/:sid]
api.route("/orders", stripeCheckoutRouter);
// 0166 bulk Mark-completed (AutoCount legacy cleanup) — POST /bulk-complete
api.route("/operation/orders", bulkCompleteRouter);
// 0165 Payments panel (Master Sheet "Balance" tab) — GET list
api.route("/operation/payments", operationPaymentsRouter);
api.route("/operation/purchase", purchaseRouter);
// 0232 staff assignment pool — GET / + PUT /:userId
api.route("/operation/staff", opsStaffRouter);
// 0236 PO duty rotation — GET current holder / PUT manager override
api.route("/operation/po-duty", poDutyRouter);
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
// 0174 — Sales Order Maintenance grid + shared column config.
api.route("/operation/sales-order-maintenance", salesOrderMaintenanceRouter);
api.route("/bd/accounts", bdAccountsRouter);
api.route("/bd/dealers", bdDealersRouter);
api.route("/bd/inquiries", bdInquiriesRouter);
api.route("/partner/dashboard", partnerDashboardRouter);
api.route("/partner/fleet", partnerFleetRouter);
api.route("/partner/orders", partnerOrdersRouter);
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
api.route("/ops/stock", opsStockRouter);
api.route("/ops/service-notes", snRouter);
api.route("/ops/service-cases", scRouter);
api.route("/ops/notes", opsNotesRouter);
api.route("/ops/tasks", opsTasksRouter);
api.route("/operation/orders", annotationsRouter);
api.route("/operation/escalations", escalationsRouter);
api.route("/operation/activity", activityRouter);

app.route("/api", api);

// Cloudflare entry — HTTP via Hono + a daily Contact-by cron (migration 0197).
// The cron schedule is declared in wrangler.toml ("0 1 * * *" = 09:00 MYT).
export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledController, env: Bindings, ctx: ExecutionContext) => {
    ctx.waitUntil(
      (async () => {
        await runContactByCron(env);
        await runFollowUpMaintenanceCron(env);
        // 0236 — Mon/Thu (MYT) PO-day reminder for the duty holder; no-ops on
        // other days and on a pre-0236 DB.
        await runPoDutyCron(env).catch((e) =>
          console.error("po-duty cron failed:", (e as Error).message),
        );
      })(),
    );
  },
};
