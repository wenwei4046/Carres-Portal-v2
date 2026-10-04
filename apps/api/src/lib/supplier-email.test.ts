import { describe, expect, it, vi } from "vitest";
import { sendSupplierPoEmail, validPoEmailAttachments } from "./supplier-email";
const attachment = { filename: "PO-001-V1.pdf", content: btoa("%PDF-1.4\n" + "x".repeat(1100)) };
const payload = { recipient: "supplier@example.invalid", subject: "Carres Purchase orders", message: "PO-001 · V1", attachments: [attachment], attemptKey: "po/email/attempt1" };
const config = { apiKey: "test-key", from: "purchase@carres.example" };
describe("supplier PDF email provider adapter", () => {
  it("fails closed before a provider call when configuration is absent", async () => {
    const request = vi.fn();
    expect(await sendSupplierPoEmail({}, payload, request)).toEqual({ status: "not_configured" });
    expect(request).not.toHaveBeenCalled();
  });
  it.each([[], [{ ...attachment, content: "" }], [attachment, attachment], [{ ...attachment, content: btoa("<html>" + "x".repeat(1100)) }]].map(files => ({ files })))("refuses incomplete, duplicate or non-PDF attachments", ({ files }) => {
    expect(validPoEmailAttachments(files)).toBe(false);
  });
  it("dispatches every independent attachment with the retry key", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "provider-id" })));
    const result = await sendSupplierPoEmail(config, payload, request);
    expect(result).toEqual({ status: "dispatched", providerId: "provider-id" });
    const options = request.mock.calls[0][1];
    expect(options.headers["Idempotency-Key"]).toBe(payload.attemptKey);
    expect(JSON.parse(options.body).attachments).toEqual([attachment]);
    expect(request).toHaveBeenCalledOnce();
  });
  it("never retries a failed send without attachments", async () => {
    const request = vi.fn().mockResolvedValue(new Response("refused", { status: 422 }));
    expect(await sendSupplierPoEmail(config, payload, request)).toEqual({ status: "failed" });
    expect(request).toHaveBeenCalledOnce();
  });
  it.each(["timeout", "server", "missing-id"])("preserves unknown outcome for %s", async kind => {
    const request = vi.fn();
    if (kind === "timeout") request.mockRejectedValue(new Error("connection lost"));
    else request.mockResolvedValue(new Response("{}", { status: kind === "server" ? 503 : 200 }));
    expect(await sendSupplierPoEmail(config, payload, request)).toEqual({ status: "unknown" });
    expect(request).toHaveBeenCalledOnce();
  });
});
