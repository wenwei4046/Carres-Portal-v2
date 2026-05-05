import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CreateLpAccountForm from "./CreateLpAccountForm";

/**
 * `apiFetch` is the canonical helper in `apps/web/src/lib/api.ts`. The task
 * spec referenced `apiPost`, but no such export exists — the convention is
 * `apiFetch(path, { method: "POST", body: JSON.stringify(...) })`. We mock
 * `apiFetch` here so the form renders synchronously without a real network.
 */
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});
import { apiFetch } from "@/lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("CreateLpAccountForm", () => {
  it("renders 4 required form fields", () => {
    render(wrap(<CreateLpAccountForm onCreated={() => {}} />));
    expect(screen.getByLabelText(/公司名|company name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contact|联络/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/address|地址/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password|密码/i)).toBeInTheDocument();
  });

  it("submits valid form and calls onCreated", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      partner_id: "p1",
      auth_user_id: "u1",
      email: "lp-p1@x",
    });
    const onCreated = vi.fn();
    render(wrap(<CreateLpAccountForm onCreated={onCreated} />));

    fireEvent.change(screen.getByLabelText(/公司名|company/i), {
      target: { value: "LP-Alpha" },
    });
    fireEvent.change(screen.getByLabelText(/contact/i), {
      target: { value: "0123456789" },
    });
    fireEvent.change(screen.getByLabelText(/address/i), {
      target: { value: "1 Demo St" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "abcd1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create|新增/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("p1"));
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/principal/partners",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("LP-Alpha"),
      }),
    );
    // Verify the JSON body roundtrips the form fields the route expects.
    const callArgs = vi.mocked(apiFetch).mock.calls[0];
    const init = callArgs[1] as RequestInit;
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({
      companyName: "LP-Alpha",
      contactNumber: "0123456789",
      address: "1 Demo St",
      password: "abcd1234",
    });
  });

  it("shows error message on API failure", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("Email already in use"));
    render(wrap(<CreateLpAccountForm onCreated={() => {}} />));

    fireEvent.change(screen.getByLabelText(/公司名/i), {
      target: { value: "LP-Alpha" },
    });
    fireEvent.change(screen.getByLabelText(/contact/i), {
      target: { value: "0123456789" },
    });
    fireEvent.change(screen.getByLabelText(/address/i), {
      target: { value: "1 Demo St" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "abcd1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create|新增/i }));

    await waitFor(() =>
      expect(screen.getByText(/Email already in use/)).toBeInTheDocument(),
    );
  });
});
