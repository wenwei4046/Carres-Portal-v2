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
api.route("/salespersons", salespersonsRouter);

app.route("/api", api);

export default app;
