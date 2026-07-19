import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { handleCreateAccount } from "../../lib/create-account";
import type { AppEnv } from "../../types";

/**
 * /api/bd/accounts — BD opens dealer accounts (Loo 2026-07-19: "BD 可以帮
 * dealer 注册新户口，功能与 principal 一致").
 *
 *   POST / — create a DEALER account: the dealership org + default outlet +
 *            the dealership-principal login + optional first staff & PIN.
 *            Shares the principal door's handler verbatim
 *            (lib/create-account.ts); `allowedRoles` pins BD to role=dealer —
 *            showroom / supplier / partner / internal accounts stay
 *            principal-only.
 *
 * Staff (sales manager / sales executive) accounts for an EXISTING store go
 * through /api/staff?dealerId= (widened to BD the same day), not here.
 */
const bdAccountsRouter = new Hono<AppEnv>();

bdAccountsRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "bd") {
    throw new HTTPException(403, { message: "BD only" });
  }
  await next();
});

bdAccountsRouter.post("/", (c) =>
  handleCreateAccount(c, { actorRole: "bd", allowedRoles: ["dealer"] }),
);

export default bdAccountsRouter;
