/**
 * NewModelModal — create a model (+ optional size SKUs) from the Modular tab.
 * Mocks: useAuth (role), useCreateCatalogModel + useGenerateSkus (mutateAsync
 * spies), sonner. The shared deriveModelKey runs for real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import NewModelModal from "./NewModelModal";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let mockRole: string | null = "principal";
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string | null }) => unknown) => selector({ role: mockRole }),
}));

const createModelAsync = vi.fn();
const generateSkusAsync = vi.fn();
vi.mock("@/lib/queries", () => ({
  useCreateCatalogModel: () => ({ mutate: vi.fn(), mutateAsync: createModelAsync, isPending: false }),
  useGenerateSkus: () => ({ mutate: vi.fn(), mutateAsync: generateSkusAsync, isPending: false }),
}));

beforeEach(() => {
  mockRole = "principal";
  createModelAsync.mockReset().mockResolvedValue({ model: { id: "m-new" } });
  generateSkusAsync.mockReset().mockResolvedValue({ ok: true, generated: 2, skipped: 0 });
});

describe("NewModelModal", () => {
  it("previews the model key + generated SKU codes from the name + sizes", () => {
    render(<NewModelModal onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("new-model-name"), { target: { value: "Lumi FirmCare" } });
    fireEvent.change(screen.getByTestId("new-model-sizes"), { target: { value: "K, Q" } });
    expect(screen.getByText(/lumi-firmcare/)).toBeInTheDocument();
    expect(screen.getByText(/LUMI-FIRMCARE-K/)).toBeInTheDocument();
  });

  it("creates a bare model (no sizes) without calling generate-skus", async () => {
    render(<NewModelModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("new-model-name"), { target: { value: "Bare Model" } });
    fireEvent.click(screen.getByText("Create model"));
    await waitFor(() => expect(createModelAsync).toHaveBeenCalledOnce());
    const arg = createModelAsync.mock.calls[0][0];
    expect(arg).toMatchObject({ category: "mattress", modelKey: "bare-model", name: "Bare Model" });
    expect(arg.allowedOptions).toBeUndefined();
    expect(generateSkusAsync).not.toHaveBeenCalled();
  });

  it("creates a model + size SKUs, seeding allowed_options.sizes and a default price", async () => {
    render(<NewModelModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("new-model-name"), { target: { value: "Lux Foam" } });
    fireEvent.change(screen.getByTestId("new-model-sizes"), { target: { value: "K, Q, K" } }); // dup K
    fireEvent.change(screen.getByTestId("new-model-price"), { target: { value: "2990" } });
    fireEvent.click(screen.getByText("Create model + 2 SKUs"));
    await waitFor(() => expect(createModelAsync).toHaveBeenCalledOnce());
    // Mattress sizes normalize to canonical full names (K → King) + dedup.
    expect(createModelAsync.mock.calls[0][0].allowedOptions).toEqual({ sizes: ["King", "Queen"] });
    await waitFor(() => expect(generateSkusAsync).toHaveBeenCalledOnce());
    expect(generateSkusAsync.mock.calls[0][0]).toEqual({
      modelId: "m-new",
      input: { variants: ["King", "Queen"], price: 2990 },
    });
  });

  it("on generate failure keeps the modal open and a retry does NOT re-create the model", async () => {
    generateSkusAsync.mockReset().mockRejectedValueOnce(new Error("no supplier covers mattress")).mockResolvedValue({ ok: true, generated: 1, skipped: 0 });
    const onClose = vi.fn();
    render(<NewModelModal onClose={onClose} />);
    fireEvent.change(screen.getByTestId("new-model-name"), { target: { value: "Akka Foam" } });
    fireEvent.change(screen.getByTestId("new-model-sizes"), { target: { value: "K" } });
    // First submit: model created, generate fails.
    fireEvent.click(screen.getByText("Create model + 1 SKU"));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(createModelAsync).toHaveBeenCalledOnce();
    // The "model created" notice appears + identity is locked.
    expect(screen.getByTestId("new-model-created-notice")).toBeInTheDocument();
    // Retry: must NOT create the model again, only re-run generate (now succeeds).
    fireEvent.click(screen.getByText("Create model + 1 SKU"));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(createModelAsync).toHaveBeenCalledOnce(); // still once
    expect(generateSkusAsync).toHaveBeenCalledTimes(2);
  });

  it("disables the primary when sizes exceed the server cap (>100)", () => {
    render(<NewModelModal onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("new-model-name"), { target: { value: "Big Range" } });
    fireEvent.change(screen.getByTestId("new-model-sizes"), {
      target: { value: Array.from({ length: 101 }, (_, i) => `s${i}`).join(",") },
    });
    expect(screen.getByTestId("new-model-sizes-error")).toBeInTheDocument();
    expect(screen.getByText(/Create model \+ 101 SKUs/)).toBeDisabled();
  });

  it("non-principal: no price field; generated SKUs are unpriced (price omitted)", async () => {
    mockRole = "operation";
    render(<NewModelModal onClose={vi.fn()} />);
    expect(screen.queryByTestId("new-model-price")).not.toBeInTheDocument();
    expect(screen.getByTestId("new-model-price-lock-hint")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("new-model-name"), { target: { value: "Lite Foam" } });
    fireEvent.change(screen.getByTestId("new-model-sizes"), { target: { value: "S" } });
    fireEvent.click(screen.getByText("Create model + 1 SKU"));
    await waitFor(() => expect(generateSkusAsync).toHaveBeenCalledOnce());
    expect(generateSkusAsync.mock.calls[0][0].input.price).toBeUndefined();
  });
});
