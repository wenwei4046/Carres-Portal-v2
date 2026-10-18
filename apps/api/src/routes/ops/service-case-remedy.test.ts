import { beforeEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import type { AppEnv } from "../../types";
import scRouter from "./service-cases";
vi.mock("../../lib/supabase", () => ({ userClient: vi.fn(), adminClient: vi.fn() }));
import { userClient, adminClient } from "../../lib/supabase";
const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "TEST", SUPABASE_JWT_SECRET: "TEST", SUPABASE_SERVICE_ROLE_KEY: "TEST" };
const app = new Hono<AppEnv>(); app.use("*", authMiddleware); app.route("/api/ops/service-cases", scRouter);
const caseId = "00000000-0000-4000-8000-000000000001";
const rpc = vi.fn();
beforeEach(() => { useTestJwks(); vi.mocked(userClient).mockReturnValue({ rpc } as never); rpc.mockReset(); vi.mocked(adminClient).mockClear(); });
async function call(path="", body?: unknown, role="operation") {
 const jwt = await signTestJwt(caseId, { email: "test@carres.com", app_metadata: { role } });
 return app.request(`/api/ops/service-cases/${caseId}/remedy${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }, env);
}
it("reads Case approval state through the signed-in scoped reader", async () => {
 rpc.mockResolvedValue({ data: { proposals: [], canDecide: false }, error: null });
 expect((await call()).status).toBe(200);
 expect(rpc).toHaveBeenCalledWith("service_case_remedy_read", { p_case_id: caseId });
 expect(adminClient).not.toHaveBeenCalled();
});
it("does not let Warehouse reach a Case decision read", async () => {
 expect((await call("", undefined, "warehouse")).status).toBe(403); expect(rpc).not.toHaveBeenCalled();
});
it("refuses browser-authored decision stamps before reaching SQL", async () => {
 expect((await call("/decisions", { approvalId: caseId, status: "approved", reason: "", decidedBy: caseId })).status).toBe(400); expect(rpc).not.toHaveBeenCalled();
});
it("preserves the SQL duty refusal instead of approving through a privileged client", async () => {
 rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Only the Service Case Approver may decide", details: "not_service_case_approver" } });
 expect((await call("/decisions", { approvalId: caseId, status: "approved", reason: "" })).status).toBe(403);
 expect(adminClient).not.toHaveBeenCalled();
});
