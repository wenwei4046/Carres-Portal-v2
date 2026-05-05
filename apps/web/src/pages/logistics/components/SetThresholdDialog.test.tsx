import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SetThresholdDialog from "./SetThresholdDialog";

/**
 * SetThresholdDialog — Phase 4.5 Chunk 2 Sprint D Task 20.
 *
 * The dialog wraps the T19 thresholds POST route. We mock `apiFetch` so the
 * tests can assert the exact path + body shape without spinning up MSW.
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
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const WAREHOUSE_ID = "22222222-2222-2222-2222-000000000001";
const WAREHOUSE_NAME = "KL Warehouse";
const SKU = "mattress:carres-cloud:king";

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({
    ok: true,
    warehouseId: WAREHOUSE_ID,
    sku: SKU,
    low: 0,
    high: 0,
  });
});

describe("SetThresholdDialog", () => {
  it("renders inputs pre-populated from currentLow / currentHigh", () => {
    render(
      wrap(
        <SetThresholdDialog
          open={true}
          onOpenChange={() => {}}
          warehouseId={WAREHOUSE_ID}
          warehouseName={WAREHOUSE_NAME}
          sku={SKU}
          currentLow={10}
          currentHigh={50}
        />,
      ),
    );

    const lowInput = screen.getByTestId(
      "set-threshold-low-input",
    ) as HTMLInputElement;
    const highInput = screen.getByTestId(
      "set-threshold-high-input",
    ) as HTMLInputElement;
    expect(lowInput.value).toBe("10");
    expect(highInput.value).toBe("50");

    // Header reflects sku + warehouse name.
    expect(
      screen.getByText(new RegExp(`Set thresholds.*${SKU}.*${WAREHOUSE_NAME}`)),
    ).toBeInTheDocument();
  });

  it("renders empty inputs when currentLow / currentHigh are null", () => {
    render(
      wrap(
        <SetThresholdDialog
          open={true}
          onOpenChange={() => {}}
          warehouseId={WAREHOUSE_ID}
          warehouseName={WAREHOUSE_NAME}
          sku={SKU}
          currentLow={null}
          currentHigh={null}
        />,
      ),
    );
    const lowInput = screen.getByTestId(
      "set-threshold-low-input",
    ) as HTMLInputElement;
    const highInput = screen.getByTestId(
      "set-threshold-high-input",
    ) as HTMLInputElement;
    expect(lowInput.value).toBe("");
    expect(highInput.value).toBe("");
  });

  it("Save calls API with correct path + body when inputs are valid", async () => {
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    render(
      wrap(
        <SetThresholdDialog
          open={true}
          onOpenChange={onOpenChange}
          warehouseId={WAREHOUSE_ID}
          warehouseName={WAREHOUSE_NAME}
          sku={SKU}
          currentLow={null}
          currentHigh={null}
          onSuccess={onSuccess}
        />,
      ),
    );

    fireEvent.change(screen.getByTestId("set-threshold-low-input"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByTestId("set-threshold-high-input"), {
      target: { value: "80" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(1);
    });
    const [path, init] = vi.mocked(apiFetch).mock.calls[0];
    expect(path).toBe(
      `/api/logistics/warehouses/${WAREHOUSE_ID}/skus/${encodeURIComponent(SKU)}/threshold`,
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ low: 20, high: 80 });

    // Success path closes the dialog and fires onSuccess.
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows inline error and skips API call when high < low", () => {
    render(
      wrap(
        <SetThresholdDialog
          open={true}
          onOpenChange={() => {}}
          warehouseId={WAREHOUSE_ID}
          warehouseName={WAREHOUSE_NAME}
          sku={SKU}
          currentLow={null}
          currentHigh={null}
        />,
      ),
    );

    fireEvent.change(screen.getByTestId("set-threshold-low-input"), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByTestId("set-threshold-high-input"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    const errBox = screen.getByTestId("set-threshold-error");
    expect(errBox).toBeInTheDocument();
    expect(errBox).toHaveTextContent(/high must be >= low/i);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("Save with both blank sends { low: null, high: null }", async () => {
    render(
      wrap(
        <SetThresholdDialog
          open={true}
          onOpenChange={() => {}}
          warehouseId={WAREHOUSE_ID}
          warehouseName={WAREHOUSE_NAME}
          sku={SKU}
          currentLow={10}
          currentHigh={50}
        />,
      ),
    );

    fireEvent.change(screen.getByTestId("set-threshold-low-input"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByTestId("set-threshold-high-input"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(1);
    });
    const [, init] = vi.mocked(apiFetch).mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({ low: null, high: null });
  });

  it("Cancel closes dialog without an API call", () => {
    const onOpenChange = vi.fn();
    render(
      wrap(
        <SetThresholdDialog
          open={true}
          onOpenChange={onOpenChange}
          warehouseId={WAREHOUSE_ID}
          warehouseName={WAREHOUSE_NAME}
          sku={SKU}
          currentLow={10}
          currentHigh={50}
        />,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
