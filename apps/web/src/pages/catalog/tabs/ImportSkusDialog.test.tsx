/**
 * ImportSkusDialog — staged import flow (pick -> preview -> result).
 * Mocks: useAuth (role), useImportSkus (mutateAsync spy), sonner.
 * The shared mapper + CSV parser run for real, so the preview reflects true
 * validation. File.text() is provided per-test (jsdom lacks the Blob primitive).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import ImportSkusDialog from "./ImportSkusDialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

let mockRole: string | null = "principal";
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string | null }) => unknown) => selector({ role: mockRole }),
}));

const mockImportMutateAsync = vi.fn();
let mockPending = false;
vi.mock("@/lib/queries", () => ({
  useImportSkus: () => ({ mutate: vi.fn(), mutateAsync: mockImportMutateAsync, isPending: mockPending }),
}));

function csvFile(text: string, name = "skus.csv"): File {
  return { name, text: async () => text } as unknown as File;
}

function pick(file: File) {
  fireEvent.change(screen.getByTestId("import-file-input"), { target: { files: [file] } });
}

beforeEach(() => {
  mockRole = "principal";
  mockPending = false;
  mockImportMutateAsync.mockReset();
  mockImportMutateAsync.mockResolvedValue({ upserted: 2, createdModels: 2, failed: 0, failures: [] });
});

describe("ImportSkusDialog", () => {
  it("renders the pick stage with file + template buttons", () => {
    render(<ImportSkusDialog onClose={() => {}} />);
    expect(screen.getByTestId("import-pick-file")).toBeInTheDocument();
    expect(screen.getByTestId("import-template")).toBeInTheDocument();
  });

  it("previews valid rows and reports skipped rows with reasons", async () => {
    render(<ImportSkusDialog onClose={() => {}} />);
    pick(csvFile("model,category,variant\nBooqit,sofa,1S\nAkka,mattress,K\nBad,mattress,\n"));
    // 2 valid, 1 skipped (missing variant)
    await waitFor(() => expect(screen.getByTestId("import-ready-count")).toHaveTextContent("2"));
    expect(screen.getByTestId("import-skipped-count")).toHaveTextContent("1");
  });

  it("confirm sends the mapped rows and shows the result", async () => {
    render(<ImportSkusDialog onClose={() => {}} />);
    pick(csvFile("model,category,variant\nBooqit,sofa,1S\nAkka,mattress,K\n"));
    await waitFor(() => expect(screen.getByTestId("import-confirm")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("import-confirm"));
    await waitFor(() => expect(mockImportMutateAsync).toHaveBeenCalledOnce());
    const rows = mockImportMutateAsync.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ model: "Booqit", modelKey: "booqit", category: "sofa", variant: "1S" });
    await waitFor(() => expect(screen.getByTestId("import-result")).toBeInTheDocument());
  });

  it("blocks a non-principal importing prices (confirm disabled)", async () => {
    mockRole = "operation";
    render(<ImportSkusDialog onClose={() => {}} />);
    pick(csvFile("model,category,variant,price\nBooqit,sofa,1S,1899\n"));
    await waitFor(() => expect(screen.getByTestId("import-pricing-blocked")).toBeInTheDocument());
    expect(screen.getByTestId("import-confirm")).toBeDisabled();
  });

  it("a non-principal CAN import structure with no prices", async () => {
    mockRole = "operation";
    render(<ImportSkusDialog onClose={() => {}} />);
    pick(csvFile("model,category,variant\nBooqit,sofa,1S\n"));
    await waitFor(() => expect(screen.getByTestId("import-confirm")).toBeInTheDocument());
    expect(screen.getByTestId("import-confirm")).not.toBeDisabled();
    expect(screen.queryByTestId("import-pricing-blocked")).not.toBeInTheDocument();
  });

  it("surfaces a parse error for an empty file", async () => {
    render(<ImportSkusDialog onClose={() => {}} />);
    pick(csvFile("\n"));
    await waitFor(() => expect(screen.getByTestId("import-parse-error")).toBeInTheDocument());
  });

  it("renders per-row failures in the result and warns when some rows fail", async () => {
    mockImportMutateAsync.mockResolvedValue({
      upserted: 1,
      createdModels: 0,
      failed: 1,
      failures: [{ row: 2, key: "BOOQIT-1S", reason: 'supplier "ghost" not found' }],
    });
    render(<ImportSkusDialog onClose={() => {}} />);
    pick(csvFile("model,category,variant\nBooqit,sofa,1S\nAkka,mattress,K\n"));
    await waitFor(() => expect(screen.getByTestId("import-confirm")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("import-confirm"));
    await waitFor(() => expect(screen.getByTestId("import-result")).toBeInTheDocument());
    expect(screen.getByText(/supplier "ghost" not found/)).toBeInTheDocument();
    expect(toast.warning).toHaveBeenCalled();
  });

  it("disables Confirm while the import is in flight", async () => {
    mockPending = true;
    render(<ImportSkusDialog onClose={() => {}} />);
    pick(csvFile("model,category,variant\nBooqit,sofa,1S\n"));
    await waitFor(() => expect(screen.getByTestId("import-confirm")).toBeInTheDocument());
    expect(screen.getByTestId("import-confirm")).toBeDisabled();
    expect(screen.getByTestId("import-confirm")).toHaveTextContent("Working…");
  });
});
