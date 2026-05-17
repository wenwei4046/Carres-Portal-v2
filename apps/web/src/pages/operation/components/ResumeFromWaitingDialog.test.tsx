import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ResumeFromWaitingDialog from "./ResumeFromWaitingDialog";

vi.mock("../../../lib/api", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "../../../lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("ResumeFromWaitingDialog", () => {
  it("calls resume-dispatch API on confirm", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ threads_resumed: 1 });
    const onClose = vi.fn();
    render(wrap(<ResumeFromWaitingDialog so={4001} onClose={onClose} />));
    fireEvent.click(screen.getByRole("button", { name: /resume to dispatch/i }));
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/operation/orders/4001/resume-dispatch",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
