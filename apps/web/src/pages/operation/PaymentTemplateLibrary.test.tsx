import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PaymentTemplateLibrary from "./PaymentTemplateLibrary";

const state = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch: state.fetch }));

const REMINDER = {
  id: "v2", template_key: "k1", purpose: "gentle_reminder",
  name: "Standard reminder", body: "Hi {customer}, RM {outstanding}. REF {ref}",
  version: 2, active: true, is_default: true, is_head: true,
  created_at: "2026-09-06T02:00:00Z",
};
const REMINDER_V1 = { ...REMINDER, id: "v1", version: 1, is_head: false,
  body: "Old wording {outstanding}" };

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PaymentTemplateLibrary />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.fetch.mockReset();
  state.fetch.mockResolvedValue({ templates: [REMINDER, REMINDER_V1] });
});

describe("WhatsApp template library (§16)", () => {
  it("lists heads under the governed purpose words; an empty purpose never invents wording", async () => {
    show();
    await waitFor(() => expect(screen.getByText("Standard reminder")).toBeInTheDocument());
    expect(screen.getByText("Gentle reminder")).toBeInTheDocument();
    expect(screen.getByText("Payment should have been received")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getAllByText("No template yet. The approved wording must come from its owner.").length)
      .toBeGreaterThan(0);
  });
  it("the 50/50 editor previews the real message and blocks Review on a lost amount field", async () => {
    show();
    await waitFor(() => expect(screen.getByText("Standard reminder")).toBeInTheDocument());
    fireEvent.click(screen.getAllByText("Edit")[0]);
    expect(screen.getByTestId("template-preview")).toHaveTextContent("Hi LIM KUAN YANG, RM 2,200. REF CR12345");
    // Removing {outstanding} from a money-ask purpose blocks Review.
    fireEvent.change(screen.getByLabelText("Wording"), { target: { value: "Hi {customer}, pay please." } });
    expect(screen.getByText("Keep the {outstanding} field. The message must say the amount.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review changes" })).toBeDisabled();
    // Restoring it unblocks; Review shows before Save.
    fireEvent.change(screen.getByLabelText("Wording"), { target: { value: "Hi {customer}, RM {outstanding} please." } });
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    expect(screen.getByTestId("template-review")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(state.fetch).toHaveBeenCalledWith(
      "/api/finance/payment-settings/templates/save",
      expect.objectContaining({ method: "POST" }),
    ));
  });
  it("View history shows every immutable version", async () => {
    show();
    await waitFor(() => expect(screen.getByText("Standard reminder")).toBeInTheDocument());
    fireEvent.click(screen.getByText("View history"));
    const history = screen.getByTestId("template-history");
    expect(history).toHaveTextContent("V2");
    expect(history).toHaveTextContent("V1");
  });
});
