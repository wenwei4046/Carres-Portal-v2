import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReportProblemModal from "./ReportProblemModal";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api";

function renderModal() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <ReportProblemModal open onClose={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("ReportProblemModal", () => {
  it("cannot send without a title", () => {
    renderModal();
    expect(screen.getByTestId("report-problem-send")).toBeDisabled();
  });

  it("sends the problem with the page address and shows the request number", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ code: "CARRES-0007" });
    renderModal();
    fireEvent.change(screen.getByLabelText(/What went wrong/), { target: { value: "Cannot issue invoice" } });
    fireEvent.click(screen.getByTestId("report-problem-send"));
    await waitFor(() => expect(screen.getByTestId("report-problem-sent")).toHaveTextContent("CARRES-0007"));
    const [path, init] = vi.mocked(apiFetch).mock.calls[0];
    expect(path).toBe("/api/it-support/tickets");
    const sent = JSON.parse(String((init as RequestInit).body));
    expect(sent.title).toBe("Cannot issue invoice");
    expect(sent.page_url).toContain("http");
    expect(sent.app_version).toBeTruthy();
  });

  it("shows the server's sentence when IT cannot be reached", async () => {
    vi.mocked(apiFetch).mockImplementation(async () => { throw new Error("IT Support could not be reached. Please try again in a moment."); });
    renderModal();
    fireEvent.change(screen.getByLabelText(/What went wrong/), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("report-problem-send"));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be reached");
  });
});
